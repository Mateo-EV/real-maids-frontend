import { Component, computed, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { disabled, form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import {
  catchError,
  EMPTY,
  firstValueFrom,
  Observable,
  of,
  Subject,
  switchMap,
  takeUntil,
  timer
} from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
import { CustomerPropertiesStore } from "@/app/features/customers/presentation/state/customer-properties.store"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { ServiceCatalogStore } from "@/app/features/service-catalog/presentation/state/service-catalog.store"
import {
  CatalogCombobox,
  CatalogComboboxOption
} from "@/app/shared/components/catalog-combobox/catalog-combobox"
import { NormalizedPagination } from "@/app/shared/pagination/pagination.params"
import { ServiceRequestsStore } from "../../state/service-requests.store"
import { OperationsErrorCode } from "../../../domain/errors/operations.error"
import { ServiceRequestSummary } from "../../../domain/models/operations-read.models"

export interface ServiceRequestEditorContext {
  owner: DestroyRef
  current: () => boolean
  onSaved: () => void
  request?: ServiceRequestSummary
  ownerChanged$?: Observable<void>
}
/**
 * Customer page the editor observes. The owner-properties list and the active service-type
 * catalog are finite server lists without a search parameter, so only this one carries one.
 */
type CustomerPageQuery = NormalizedPagination & { readonly search?: string }
/** Only the one catalog contract that really supports a server-side search is debounced. */
const searchDebounceMs = 250
/** One searchable picker contract: the panel never filters, pages or totals on its own. */
interface CatalogField {
  readonly key: "customerId" | "propertyId" | "serviceTypeId"
  readonly label: string
  readonly name: string
  readonly placeholder: string
  readonly searchPlaceholder: string
  readonly emptyLabel: string
  readonly errorLabel: string
  readonly options: readonly CatalogComboboxOption[]
  readonly selected: string
  /** Only the customer page has a server search parameter; the other two are finite lists. */
  readonly searchable: boolean
  readonly busy: boolean
  readonly failed: boolean
  readonly loaded: boolean
  readonly empty: boolean
  readonly page?: number
  readonly pageCount?: number
}
const positiveId = (value: string) => /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647
/** A selection whose option left the verified page stays visible without inventing a record. */
const missingChoice = (label: string) => `${label} no disponible en el catálogo actual`
const calendar = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

@Component({
  selector: "app-service-request-editor",
  imports: [
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmTextareaImports,
    HlmAlertImports,
    HlmSpinnerImports,
    CatalogCombobox
  ],
  templateUrl: "./service-request-editor.html"
})
export class ServiceRequestEditor implements OnInit {
  readonly context = injectBrnDialogContext<ServiceRequestEditorContext>()
  // The detail consumer captures a legitimately loaded request once. Catalog
  // refreshes never rewrite its owner or the original-reference exception.
  readonly editing = this.context.request ? { ...this.context.request } : undefined
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly customers = inject(CustomersStore)
  private readonly properties = inject(CustomerPropertiesStore)
  private readonly catalog = inject(ServiceCatalogStore)
  private readonly store = inject(ServiceRequestsStore)
  private readonly requested = signal<CustomerPageQuery>({ offset: 0, limit: 20 })
  // Only the explicitly selected safe identity/context is retained locally, never
  // a catalog result. Its originating root entry remains the authority at dispatch.
  readonly selectedCustomer = signal<{
    id: number
    name: string
    query: CustomerPageQuery
  } | null>(null)
  /** One active customer key: a search supersedes the previous read instead of adding keys. */
  private readonly customerQueries = new Subject<{
    query: CustomerPageQuery
    force: boolean
    delay: number
  }>()
  private readonly ownerChanged = new Subject<void>()
  private readonly customerAdmissionError = signal(false)
  private readonly propertyAdmissionError = signal(false)
  private readonly typeAdmissionError = signal(false)
  readonly error = signal("")
  readonly model = signal({
    customerId: this.editing ? String(this.editing.customerId) : "",
    propertyId: this.editing ? String(this.editing.propertyId) : "",
    serviceTypeId: this.editing ? String(this.editing.serviceTypeId) : "",
    description: this.editing?.description ?? "",
    desiredDate: this.editing?.desiredDate ?? ""
  })
  readonly customerEntry = computed(() => this.customers.selectQuery(this.requested()))
  readonly customerPage = computed(() => this.customerEntry().result)
  /** Effective returned metadata, carrying the search term of the observed key. */
  readonly customerQuery = computed<CustomerPageQuery>(() => {
    const page = this.customerPage()
    const search = this.requested().search
    return page
      ? { offset: page.offset, limit: page.limit, ...(search ? { search } : {}) }
      : this.requested()
  })
  readonly currentPage = computed(
    () => this.customerQuery().offset / this.customerQuery().limit + 1
  )
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.customerPage()?.total ?? 0) / this.customerQuery().limit))
  )
  private readonly loadedCustomers = computed<readonly CatalogComboboxOption[]>(
    () =>
      this.customerEntry()
        .result?.items.filter(c => c.isActive)
        .map(c => ({ value: String(c.id), label: c.name })) ?? []
  )
  /** Verified page options plus the retained identity, never a fabricated customer. */
  readonly customerOptions = computed<readonly CatalogComboboxOption[]>(() => {
    const loaded = this.loadedCustomers()
    const selected = this.selectedCustomer()
    const value = this.model().customerId
    if (!value || loaded.some(option => option.value === value)) return loaded
    const name = selected && String(selected.id) === value ? selected.name : undefined
    return [
      {
        value,
        label: name ? `${name} · no disponible en esta página` : missingChoice("Cliente")
      },
      ...loaded
    ]
  })
  readonly customerBusy = computed(
    () => this.customerEntry().loading || this.customerEntry().refreshing
  )
  readonly customerFailed = computed(
    () => !!this.customerEntry().error || this.customerAdmissionError()
  )
  readonly propertyEntry = computed(() =>
    this.properties.selectProperties(this.editing?.customerId ?? this.selectedCustomer()?.id ?? 0)
  )
  readonly propertyBusy = computed(
    () => (this.propertyEntry().pendingReads ?? 0) > 0 || this.propertyEntry().refreshing
  )
  readonly propertyFailed = computed(
    () => !!this.propertyEntry().error || this.propertyAdmissionError()
  )
  readonly propertyOptions = computed(
    () =>
      this.propertyEntry()
        .data?.filter(
          p =>
            p.isActive && p.customerId === (this.editing?.customerId ?? this.selectedCustomer()?.id)
        )
        .map(p => ({ id: p.id, label: `${p.alias ?? "Sin alias"} · ${p.address}` })) ?? []
  )
  readonly typeEntry = computed(() => this.catalog.selectActiveServiceTypes())
  readonly typeBusy = computed(
    () => (this.typeEntry().pendingReads ?? 0) > 0 || this.typeEntry().refreshing
  )
  readonly typeFailed = computed(() => !!this.typeEntry().error || this.typeAdmissionError())
  readonly typeOptions = computed(
    () => this.typeEntry().data?.map(t => ({ id: t.id, label: t.name })) ?? []
  )

  readonly editPropertyOptions = computed(() =>
    this.editing
      ? [
          {
            id: this.editing.propertyId,
            label: this.editing.propertyName
          },
          ...this.propertyOptions().filter(option => option.id !== this.editing!.propertyId)
        ]
      : this.propertyOptions()
  )
  readonly editTypeOptions = computed(() =>
    this.editing
      ? [
          {
            id: this.editing.serviceTypeId,
            label: this.editing.serviceTypeName
          },
          ...this.typeOptions().filter(option => option.id !== this.editing!.serviceTypeId)
        ]
      : this.typeOptions()
  )
  private readonly propertyChoices = computed<readonly CatalogComboboxOption[]>(() =>
    this.withMissing(this.editPropertyOptions(), this.model().propertyId, "Propiedad")
  )
  private readonly typeChoices = computed<readonly CatalogComboboxOption[]>(() =>
    this.withMissing(this.editTypeOptions(), this.model().serviceTypeId, "Tipo de servicio")
  )

  readonly catalogs = computed<readonly CatalogField[]>(() => [
    ...(this.editing
      ? []
      : [
          {
            key: "customerId" as const,
            label: "Cliente",
            name: "clientes",
            placeholder: "Selecciona cliente",
            searchPlaceholder: "Buscar cliente…",
            emptyLabel: "Sin clientes para esta búsqueda.",
            errorLabel: "No se pudieron cargar los clientes.",
            options: this.customerOptions(),
            selected: this.choiceLabel(this.customerOptions(), this.model().customerId),
            searchable: true,
            loaded: !!this.customerPage(),
            empty: !this.loadedCustomers().length,
            busy: this.customerBusy(),
            failed: this.customerFailed(),
            page: this.currentPage(),
            pageCount: this.pageCount()
          }
        ]),
    {
      key: "propertyId" as const,
      label: "Propiedad",
      name: "propiedades",
      placeholder: "Selecciona propiedad",
      searchPlaceholder: "Buscar propiedad…",
      emptyLabel: "Sin propiedades activas del cliente.",
      errorLabel: "No se pudieron cargar las propiedades.",
      options: this.propertyChoices(),
      selected: this.choiceLabel(this.propertyChoices(), this.model().propertyId),
      searchable: false,
      loaded: this.propertyEntry().loaded,
      empty: !this.propertyOptions().length,
      busy: this.propertyBusy(),
      failed: this.propertyFailed()
    },
    {
      key: "serviceTypeId" as const,
      label: "Tipo de servicio",
      name: "tipos de servicio",
      placeholder: "Selecciona tipo de servicio",
      searchPlaceholder: "Buscar tipo de servicio…",
      emptyLabel: "Sin tipos de servicio en el catálogo recibido.",
      errorLabel: "No se pudieron cargar los tipos de servicio.",
      options: this.typeChoices(),
      selected: this.choiceLabel(this.typeChoices(), this.model().serviceTypeId),
      searchable: false,
      loaded: this.typeEntry().loaded,
      empty: !this.typeOptions().length,
      busy: this.typeBusy(),
      failed: this.typeFailed()
    }
  ])
  readonly textFields = [
    {
      key: "description" as const,
      label: "Descripción (opcional)",
      help: "Hasta 2000 caracteres. Se omiten espacios al inicio y al final."
    },
    {
      key: "desiredDate" as const,
      label: "Fecha deseada (opcional)",
      help: "Fecha de calendario. El servidor valida la política de fechas del servicio."
    }
  ]
  loadCatalog(key: "customerId" | "propertyId" | "serviceTypeId"): void {
    if (key === "customerId") this.loadCustomers(true)
    else if (key === "propertyId") this.loadProperties(true)
    else this.loadTypes(true)
  }
  /** Only a value the picker actually offers becomes the model; nothing is inferred. */
  choiceChanged(key: "customerId" | "propertyId" | "serviceTypeId", value: string): void {
    if (!this.current() || this.pending()) return
    if (key === "customerId") {
      this.customerChanged(value)
      return
    }
    if (value === this.model()[key]) return
    this.model.update(m => ({ ...m, [key]: value }))
  }

  private validCustomer(value: string): boolean {
    if (this.editing) return positiveId(value) && Number(value) === this.editing.customerId
    const selected = this.selectedCustomer()
    if (!positiveId(value) || !selected || selected.id !== Number(value)) return false
    const source = this.customers.selectQuery(selected.query)
    const requested = this.requested()
    const sameQuery =
      selected.query.offset === requested.offset &&
      selected.query.limit === requested.limit &&
      (selected.query.search ?? "") === (requested.search ?? "")
    if (sameQuery && this.customerAdmissionError()) return false
    return (
      !!source.result &&
      !source.loading &&
      !source.refreshing &&
      !source.error &&
      source.expires > Date.now() &&
      source.result.items.some(c => c.id === selected.id && c.isActive)
    )
  }
  private validProperty(value: string): boolean {
    if (this.editing)
      return (
        positiveId(value) &&
        (Number(value) === this.editing.propertyId ||
          (this.propertyEntry().loaded &&
            this.propertyEntry().expires > Date.now() &&
            !this.propertyBusy() &&
            !this.propertyFailed() &&
            this.propertyOptions().some(p => p.id === Number(value))))
      )
    return (
      this.validCustomer(this.model().customerId) &&
      positiveId(value) &&
      this.propertyEntry().loaded &&
      this.propertyEntry().expires > Date.now() &&
      !this.propertyBusy() &&
      !this.propertyFailed() &&
      this.propertyOptions().some(p => p.id === Number(value))
    )
  }
  private validType(value: string): boolean {
    if (this.editing && positiveId(value) && Number(value) === this.editing.serviceTypeId)
      return true
    return (
      positiveId(value) &&
      this.typeEntry().loaded &&
      this.typeEntry().expires > Date.now() &&
      !this.typeBusy() &&
      !this.typeFailed() &&
      this.typeOptions().some(t => t.id === Number(value))
    )
  }
  readonly profile = form(this.model, path => {
    disabled(path, () => this.store.writing())
    validate(path.customerId, ({ value }) =>
      this.validCustomer(value())
        ? undefined
        : { kind: "choice", message: "Selecciona un cliente activo verificado." }
    )
    validate(path.propertyId, ({ value }) =>
      this.validProperty(value())
        ? undefined
        : { kind: "choice", message: "Selecciona una propiedad activa verificada del cliente." }
    )
    validate(path.serviceTypeId, ({ value }) =>
      this.validType(value())
        ? undefined
        : { kind: "choice", message: "Selecciona un tipo de servicio verificado." }
    )
    validate(path.description, ({ value }) =>
      value().trim().length <= 2000
        ? undefined
        : { kind: "maxLength", message: "Usa como máximo 2000 caracteres." }
    )
    validate(path.desiredDate, ({ value }) =>
      !value().trim() || calendar(value().trim())
        ? undefined
        : { kind: "calendar", message: "Ingresa una fecha de calendario válida." }
    )
  })
  readonly pending = computed(() => this.profile().submitting() || this.store.writing())
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set("La sesión no está disponible. Vuelve a iniciar sesión.")
  )
  private current(): boolean {
    return (
      !this.destroyRef.destroyed &&
      !this.context.owner.destroyed &&
      this.context.current() &&
      this.lifecycle.current() &&
      this.dialog.open
    )
  }
  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.ownerChanged.next()
      this.ownerChanged.complete()
    })
    if (this.editing) {
      this.loadProperties()
      this.loadTypes()
      return
    }
    this.customerQueries
      .pipe(
        switchMap(request =>
          (request.delay ? timer(request.delay) : of(0)).pipe(
            switchMap(() => {
              if (!this.current() || this.editing) return EMPTY
              const query = request.query
              this.requested.set(query)
              this.customerAdmissionError.set(false)
              return this.customers.observeQuery(query, request.force).pipe(
                takeUntil(this.lifecycle.cancelled$),
                catchError(() => {
                  this.customerAdmissionError.set(true)
                  return EMPTY
                })
              )
            })
          )
        ),
        takeUntilDestroyed(this.destroyRef),
        takeUntilDestroyed(this.context.owner)
      )
      .subscribe(result => {
        if (!this.current()) return
        if (!result.success) {
          if (!this.customerEntry().error) this.customerAdmissionError.set(true)
          return
        }
        const selected = this.selectedCustomer()
        const verified = selected && result.data.items.find(c => c.id === selected.id && c.isActive)
        // A verified same-owner revisit may use a different effective query key.
        // Rebind its authority without resetting the property or fetching it again.
        if (verified)
          this.selectedCustomer.set({
            id: verified.id,
            name: verified.name,
            query: { ...this.requested() }
          })
      })
    this.loadCustomers()
    this.loadTypes()
  }
  loadCustomers(force = false): void {
    if (this.editing) return
    if (!this.current() || this.pending()) return
    this.customerQueries.next({ query: this.requested(), force, delay: 0 })
  }
  /**
   * Server-side search inside the picker. The current effective size is kept, the page
   * restarts at zero, and the selection/property context is never reset by a search.
   */
  searchCustomers(value: string): void {
    if (this.editing) return
    if (!this.current() || this.pending()) return
    const search = value.trim()
    if ((this.requested().search ?? "") === search) return
    this.customerQueries.next({
      query: {
        offset: 0,
        limit: this.customerQuery().limit,
        ...(search ? { search } : {})
      },
      force: false,
      delay: searchDebounceMs
    })
  }
  goToPage(page: number): void {
    if (this.editing) return
    if (
      !this.current() ||
      this.pending() ||
      this.customerBusy() ||
      !this.customerPage() ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > this.pageCount() ||
      page === this.currentPage()
    )
      return
    const { limit, search } = this.customerQuery()
    this.customerQueries.next({
      query: { offset: (page - 1) * limit, limit, ...(search ? { search } : {}) },
      force: false,
      delay: 0
    })
  }
  customerChanged(value: string): void {
    if (this.editing) return
    if (!this.current() || this.pending()) return
    if (value === String(this.selectedCustomer()?.id ?? "")) return
    // Cancel the prior owner before resetting/reading any replacement context.
    this.ownerChanged.next()
    this.selectedCustomer.set(null)
    this.model.update(m => ({ ...m, customerId: value, propertyId: "" }))
    this.propertyAdmissionError.set(false)
    const entry = this.customerEntry()
    const customer =
      !this.customerBusy() && !this.customerFailed()
        ? entry.result?.items.find(c => c.id === Number(value) && c.isActive)
        : undefined
    if (!customer || !positiveId(value)) return
    this.selectedCustomer.set({
      id: customer.id,
      name: customer.name,
      query: { ...this.requested() }
    })
    this.loadProperties()
  }
  loadProperties(force = false): void {
    if (this.editing) {
      this.loadEditProperties(force)
      return
    }
    if (!this.current() || this.pending() || !this.validCustomer(this.model().customerId)) return
    const owner = this.selectedCustomer()!.id
    this.propertyAdmissionError.set(false)
    this.properties
      .loadProperties(owner, force)
      .pipe(
        takeUntil(this.ownerChanged),
        takeUntil(this.lifecycle.cancelled$),
        takeUntilDestroyed(this.destroyRef),
        takeUntilDestroyed(this.context.owner),
        catchError(() => {
          if (this.current() && this.selectedCustomer()?.id === owner)
            this.propertyAdmissionError.set(true)
          return EMPTY
        })
      )
      .subscribe(result => {
        if (
          !result.success &&
          this.current() &&
          this.selectedCustomer()?.id === owner &&
          !this.propertyEntry().error
        )
          this.propertyAdmissionError.set(true)
      })
  }
  private loadEditProperties(force: boolean): void {
    const request = this.editing
    if (!request || !this.current() || this.pending()) return
    this.propertyAdmissionError.set(false)
    this.properties
      .loadProperties(request.customerId, force)
      .pipe(
        takeUntil(this.context.ownerChanged$ ?? EMPTY),
        takeUntil(this.lifecycle.cancelled$),
        takeUntilDestroyed(this.destroyRef),
        takeUntilDestroyed(this.context.owner),
        catchError(() => {
          if (this.current()) this.propertyAdmissionError.set(true)
          return EMPTY
        })
      )
      .subscribe(result => {
        if (!result.success && this.current() && !this.propertyEntry().error)
          this.propertyAdmissionError.set(true)
      })
  }
  loadTypes(force = false): void {
    if (!this.current() || this.pending()) return
    this.typeAdmissionError.set(false)
    this.catalog
      .loadActiveServiceTypes(force)
      .pipe(
        takeUntil(this.context.ownerChanged$ ?? EMPTY),
        takeUntil(this.lifecycle.cancelled$),
        takeUntilDestroyed(this.destroyRef),
        takeUntilDestroyed(this.context.owner),
        catchError(() => {
          if (this.current()) this.typeAdmissionError.set(true)
          return EMPTY
        })
      )
      .subscribe(result => {
        if (!result.success && this.current() && !this.typeEntry().error)
          this.typeAdmissionError.set(true)
      })
  }
  private choiceLabel(options: readonly CatalogComboboxOption[], value: string): string {
    return options.find(option => option.value === value)?.label ?? ""
  }
  /** Verified choices plus the retained value, labelled without inventing a catalog name. */
  private withMissing(
    options: readonly { readonly id: number; readonly label: string }[],
    value: string,
    label: string
  ): readonly CatalogComboboxOption[] {
    const loaded = options.map(option => ({ value: String(option.id), label: option.label }))
    if (!value || loaded.some(option => option.value === value)) return loaded
    return [{ value, label: missingChoice(label) }, ...loaded]
  }
  /**
   * Native selects were replaced by pickers, so nothing blurs a choice field. A submission
   * attempt must still surface its validation messages for all three catalog choices.
   */
  private touchChoices(): void {
    this.profile.customerId().markAsTouched()
    this.profile.propertyId().markAsTouched()
    this.profile.serviceTypeId().markAsTouched()
  }
  save(): Promise<boolean> {
    if (this.editing) return this.saveEdit()
    if (!this.current() || this.pending()) return Promise.resolve(false)
    this.error.set("")
    this.touchChoices()
    return submit(this.profile, async () => {
      const v = this.model()
      if (!this.current() || this.store.writing()) return
      if (
        !this.validCustomer(v.customerId) ||
        !this.validProperty(v.propertyId) ||
        !this.validType(v.serviceTypeId)
      ) {
        this.error.set("Actualiza los catálogos de las opciones seleccionadas antes de guardar.")
        return
      }
      if (
        v.description.trim().length > 2000 ||
        (v.desiredDate.trim() !== "" && !calendar(v.desiredDate.trim()))
      )
        return
      try {
        const result = await firstValueFrom(
          this.store
            .createRequest({
              customerId: Number(v.customerId),
              propertyId: Number(v.propertyId),
              serviceTypeId: Number(v.serviceTypeId),
              description: v.description.trim() || null,
              desiredDate: v.desiredDate.trim() || null
            })
            .pipe(
              takeUntil(this.ownerChanged),
              takeUntil(this.lifecycle.cancelled$),
              takeUntilDestroyed(this.destroyRef),
              takeUntilDestroyed(this.context.owner)
            ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success) this.error.set(this.writeError(result.error.code))
        else {
          this.context.onSaved()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current())
          this.error.set(
            "No se pudo confirmar el guardado. Consulta las solicitudes antes de reintentar."
          )
      }
    })
  }
  private saveEdit(): Promise<boolean> {
    const request = this.editing
    if (!request || !this.current() || this.pending()) return Promise.resolve(false)
    this.error.set("")
    this.touchChoices()
    return submit(this.profile, async () => {
      const v = this.model()
      if (!this.current() || this.store.writing()) return
      // Original references are legitimate captured metadata. Only a changed
      // choice must be backed by a fresh, successful active-membership read.
      if (
        !this.validCustomer(v.customerId) ||
        !this.validProperty(v.propertyId) ||
        !this.validType(v.serviceTypeId)
      ) {
        this.error.set("Actualiza los catálogos de las opciones seleccionadas antes de guardar.")
        return
      }
      if (
        v.description.trim().length > 2000 ||
        (v.desiredDate.trim() !== "" && !calendar(v.desiredDate.trim()))
      )
        return
      try {
        const result = await firstValueFrom(
          this.store
            .updateRequest(
              request.id,
              {
                propertyId: Number(v.propertyId),
                serviceTypeId: Number(v.serviceTypeId),
                description: v.description.trim() || null,
                desiredDate: v.desiredDate.trim() || null
              },
              request.customerId
            )
            .pipe(
              takeUntil(this.context.ownerChanged$ ?? EMPTY),
              takeUntil(this.lifecycle.cancelled$),
              takeUntilDestroyed(this.destroyRef),
              takeUntilDestroyed(this.context.owner)
            ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success) this.error.set(this.writeError(result.error.code))
        else {
          this.context.onSaved()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current())
          this.error.set(
            "No se pudo confirmar el guardado. Consulta las solicitudes antes de reintentar."
          )
      }
    })
  }
  private writeError(code: OperationsErrorCode): string {
    switch (code) {
      case "FORBIDDEN":
        return "No tienes permiso para realizar esta operación."
      case "INVALID_DATA":
        return "Revisa los datos y las opciones seleccionadas."
      case "CONFLICT":
        return "Los datos entran en conflicto. Revisa la solicitud antes de reintentar."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "NOT_FOUND":
        return "Una opción ya no está disponible. Revisa los catálogos."
      case "UNCONFIGURED":
        return "El servicio no está disponible en este entorno."
      default:
        return "No se pudo confirmar el guardado. Consulta las solicitudes antes de reintentar."
    }
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.pending() && this.dialog.open) this.dialog.close()
  }
}
