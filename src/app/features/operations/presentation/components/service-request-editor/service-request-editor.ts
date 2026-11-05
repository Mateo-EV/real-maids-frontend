import { Component, computed, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { disabled, form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { catchError, EMPTY, firstValueFrom, Observable, Subject, switchMap, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
import { CustomerPropertiesStore } from "@/app/features/customers/presentation/state/customer-properties.store"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { ServiceCatalogStore } from "@/app/features/service-catalog/presentation/state/service-catalog.store"
import { TablePagination } from "@/app/shared/components/table-pagination/table-pagination"
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
const positiveId = (value: string) => /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647
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
    HlmNativeSelectImports,
    HlmAlertImports,
    HlmSpinnerImports,
    TablePagination
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
  private readonly requested = signal<NormalizedPagination>({ offset: 0, limit: 20 })
  // Only the explicitly selected safe identity/context is retained locally, never
  // a catalog result. Its originating root entry remains the authority at dispatch.
  readonly selectedCustomer = signal<{
    id: number
    name: string
    query: NormalizedPagination
  } | null>(null)
  private readonly customerQueries = new Subject<{ query: NormalizedPagination; force: boolean }>()
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
  readonly customerQuery = computed(() => {
    const page = this.customerPage()
    return page ? { offset: page.offset, limit: page.limit } : this.requested()
  })
  readonly currentPage = computed(
    () => this.customerQuery().offset / this.customerQuery().limit + 1
  )
  readonly pageCount = computed(() =>
    Math.max(1, Math.ceil((this.customerPage()?.total ?? 0) / this.customerQuery().limit))
  )
  readonly customerOptions = computed(
    () =>
      this.customerEntry()
        .result?.items.filter(c => c.isActive)
        .map(c => ({
          id: c.id,
          label: `${c.name} · ID ${c.id}`
        })) ?? []
  )
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
        .map(p => ({ id: p.id, label: `${p.alias ?? "Sin alias"} · ${p.address} · ID ${p.id}` })) ??
      []
  )
  readonly typeEntry = computed(() => this.catalog.selectActiveServiceTypes())
  readonly typeBusy = computed(
    () => (this.typeEntry().pendingReads ?? 0) > 0 || this.typeEntry().refreshing
  )
  readonly typeFailed = computed(() => !!this.typeEntry().error || this.typeAdmissionError())
  readonly typeOptions = computed(
    () => this.typeEntry().data?.map(t => ({ id: t.id, label: `${t.name} · ID ${t.id}` })) ?? []
  )

  readonly editPropertyOptions = computed(() =>
    this.editing
      ? [
          {
            id: this.editing.propertyId,
            label: `${this.editing.propertyName} · ID ${this.editing.propertyId}`
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
            label: `${this.editing.serviceTypeName} · ID ${this.editing.serviceTypeId}`
          },
          ...this.typeOptions().filter(option => option.id !== this.editing!.serviceTypeId)
        ]
      : this.typeOptions()
  )

  readonly catalogs = computed(() => [
    ...(this.editing
      ? []
      : [
          {
            key: "customerId" as const,
            label: "Cliente",
            name: "clientes",
            options: this.customerOptions(),
            loaded: !!this.customerPage(),
            busy: this.customerBusy(),
            failed: this.customerFailed()
          }
        ]),
    {
      key: "propertyId" as const,
      label: "Propiedad",
      name: "propiedades",
      options: this.editPropertyOptions(),
      loaded: this.propertyEntry().loaded,
      busy: this.propertyBusy(),
      failed: this.propertyFailed()
    },
    {
      key: "serviceTypeId" as const,
      label: "Tipo de servicio",
      name: "tipos de servicio",
      options: this.editTypeOptions(),
      loaded: this.typeEntry().loaded,
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

  private validCustomer(value: string): boolean {
    if (this.editing) return positiveId(value) && Number(value) === this.editing.customerId
    const selected = this.selectedCustomer()
    if (!positiveId(value) || !selected || selected.id !== Number(value)) return false
    const source = this.customers.selectQuery(selected.query)
    const sameQuery =
      selected.query.offset === this.requested().offset &&
      selected.query.limit === this.requested().limit
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
        switchMap(({ query, force }) => {
          this.requested.set(query)
          this.customerAdmissionError.set(false)
          return this.customers.observeQuery(query, force).pipe(
            takeUntil(this.lifecycle.cancelled$),
            catchError(() => {
              this.customerAdmissionError.set(true)
              return EMPTY
            })
          )
        }),
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
    this.customerQueries.next({ query: this.requested(), force })
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
    this.customerQueries.next({
      query: { offset: (page - 1) * this.customerQuery().limit, limit: this.customerQuery().limit },
      force: false
    })
  }
  customerChanged(event: Event): void {
    if (this.editing) return
    if (!this.current() || this.pending()) return
    const value = (event.target as HTMLSelectElement).value
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
  hasChoice(key: "customerId" | "propertyId" | "serviceTypeId", value: string): boolean {
    const options =
      key === "customerId"
        ? this.customerOptions()
        : key === "propertyId"
          ? this.editPropertyOptions()
          : this.editTypeOptions()
    return options.some(o => String(o.id) === value)
  }
  save(): Promise<boolean> {
    if (this.editing) return this.saveEdit()
    if (!this.current() || this.pending()) return Promise.resolve(false)
    this.error.set("")
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
