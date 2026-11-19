import { Component, computed, DestroyRef, inject, OnInit, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { disabled, form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { catchError, EMPTY, firstValueFrom, of, Subject, switchMap, takeUntil, timer } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { NormalizedPagination } from "@/app/shared/pagination/pagination.params"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
import {
  CatalogCombobox,
  CatalogComboboxOption
} from "@/app/shared/components/catalog-combobox/catalog-combobox"
import { CustomerSupportErrorCode } from "../../../domain/errors/customer-support.error"
import { SupportRequestsStore } from "../../state/support-requests.store"

export interface SupportRequestCreateContext {
  owner: DestroyRef
  current: () => boolean
  onCreated: () => void
}

/** One observed customer page: only this contract has a server-side search parameter. */
type CustomerPageQuery = NormalizedPagination & { readonly search?: string }
/** Documented wire limits for the create payload (S8). */
const subjectLimit = 150
const descriptionLimit = 4000
/** The only customer contract with a server-side search is debounced. */
const searchDebounceMs = 250
const positiveId = (value: string) => /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647

/**
 * T8 create consumer (S5, S6, S8, S11): one customer page at a time through the real
 * `CustomersStore` (never a downloaded catalog), the finite type catalog of the root
 * support store with its own loading/error/retry, and the documented payload. The
 * transport still owns value validation; authorization stays on the backend.
 */
@Component({
  selector: "app-support-request-create-dialog",
  imports: [
    FormField,
    FormRoot,
    CatalogCombobox,
    HlmAlertImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSpinnerImports,
    HlmTextareaImports
  ],
  templateUrl: "./support-request-create-dialog.html"
})
export class SupportRequestCreateDialog implements OnInit {
  readonly context = injectBrnDialogContext<SupportRequestCreateContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(SupportRequestsStore)
  private readonly customers = inject(CustomersStore)
  /** The one observed customer key; typing supersedes it instead of adding keys. */
  private readonly requested = signal<CustomerPageQuery>({ offset: 0, limit: 20 })
  private readonly customerQueries = new Subject<{
    query: CustomerPageQuery
    force: boolean
    delay: number
  }>()
  private readonly customerAdmissionError = signal(false)
  private readonly typeAdmissionError = signal(false)
  readonly error = signal("")
  readonly model = signal({
    customerId: "",
    requestTypeId: "",
    subject: "",
    description: ""
  })

  readonly customerEntry = computed(() => this.customers.selectQuery(this.requested()))
  readonly customerPage = computed(() => this.customerEntry().result)
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
  private readonly loadedCustomers = computed<readonly CatalogComboboxOption[]>(() =>
    (this.customerPage()?.items ?? [])
      .filter(customer => customer.isActive)
      .map(customer => ({ value: String(customer.id), label: customer.name }))
  )
  /** Only verified page options plus the retained choice; no customer is invented. */
  readonly customerOptions = computed<readonly CatalogComboboxOption[]>(() => {
    const loaded = this.loadedCustomers()
    const value = this.model().customerId
    if (!value || loaded.some(option => option.value === value)) return loaded
    return [...loaded, { value, label: "Cliente no disponible en esta página" }]
  })
  readonly customerLabel = computed(
    () =>
      this.customerOptions().find(option => option.value === this.model().customerId)?.label ?? ""
  )
  readonly customerBusy = computed(
    () => this.customerEntry().loading || this.customerEntry().refreshing
  )
  readonly customerFailed = computed(
    () => !!this.customerEntry().error || this.customerAdmissionError()
  )
  readonly typeEntry = computed(() => this.store.selectRequestTypes())
  readonly typeBusy = computed(() => this.typeEntry().loading || this.typeEntry().refreshing)
  readonly typeFailed = computed(() => !!this.typeEntry().error || this.typeAdmissionError())
  /** S4/S8: the supplied type catalog is the only vocabulary; there is no status catalog. */
  readonly typeOptions = computed<readonly { value: string; label: string }[]>(() => {
    const loaded = (this.typeEntry().result ?? []).map(type => ({
      value: String(type.id),
      label: type.name
    }))
    const value = this.model().requestTypeId
    if (!value || loaded.some(option => option.value === value)) return loaded
    return [...loaded, { value, label: "Tipo no disponible en el catálogo actual" }]
  })

  readonly profile = form(this.model, path => {
    disabled(path, () => this.store.writing())
    validate(path.customerId, ({ value }) =>
      this.validCustomer(value())
        ? undefined
        : { kind: "choice", message: "Selecciona un cliente activo verificado." }
    )
    validate(path.requestTypeId, ({ value }) =>
      this.validType(value())
        ? undefined
        : { kind: "choice", message: "Selecciona un tipo de atención verificado." }
    )
    validate(path.subject, ({ value }) => {
      const subject = value().trim()
      if (!subject) return { kind: "required", message: "El asunto es obligatorio." }
      return subject.length > subjectLimit
        ? { kind: "maxLength", message: `Usa como máximo ${subjectLimit} caracteres.` }
        : undefined
    })
    validate(path.description, ({ value }) => {
      const description = value().trim()
      if (!description) return { kind: "required", message: "La descripción es obligatoria." }
      return description.length > descriptionLimit
        ? { kind: "maxLength", message: `Usa como máximo ${descriptionLimit} caracteres.` }
        : undefined
    })
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

  /**
   * A choice is dispatchable only while the verified entry that produced it is current:
   * a stale, failed or in-flight catalog cannot be used to authorize the payload.
   */
  private validCustomer(value: string): boolean {
    const entry = this.customerEntry()
    return (
      positiveId(value) &&
      !!entry.result &&
      !entry.loading &&
      !entry.refreshing &&
      !entry.error &&
      !this.customerAdmissionError() &&
      entry.expires > Date.now() &&
      entry.result.items.some(customer => customer.id === Number(value) && customer.isActive)
    )
  }
  private validType(value: string): boolean {
    const entry = this.typeEntry()
    return (
      positiveId(value) &&
      !!entry.result &&
      !entry.loading &&
      !entry.refreshing &&
      !entry.error &&
      !this.typeAdmissionError() &&
      entry.expires > Date.now() &&
      entry.result.some(type => type.id === Number(value))
    )
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.customerQueries.complete()
    })
    this.customerQueries
      .pipe(
        switchMap(request =>
          (request.delay ? timer(request.delay) : of(0)).pipe(
            switchMap(() => {
              if (!this.current()) return EMPTY
              this.requested.set(request.query)
              this.customerAdmissionError.set(false)
              return this.customers.observeQuery(request.query, request.force).pipe(
                takeUntil(this.lifecycle.cancelled$),
                catchError(() => {
                  if (this.current()) this.customerAdmissionError.set(true)
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
        if (!this.current() || !result || result.success) return
        if (!this.customerEntry().error) this.customerAdmissionError.set(true)
      })
    this.loadCustomers()
    this.loadTypes()
  }

  /** One read of the page the picker is observing; never a catalog download. */
  loadCustomers(force = false): void {
    if (!this.current() || this.pending()) return
    this.customerQueries.next({ query: this.requested(), force, delay: 0 })
  }

  /** Server-side search: it restarts at page zero and keeps the effective size. */
  searchCustomers(value: string): void {
    if (!this.current() || this.pending()) return
    const search = value.trim()
    if ((this.requested().search ?? "") === search) {
      this.customerQueries.next({ query: this.requested(), force: false, delay: 0 })
      return
    }
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

  /** Only an offered value becomes the choice; clearing it is the only way to drop it. */
  customerChanged(value: string): void {
    if (!this.current() || this.pending()) return
    if (value === this.model().customerId) return
    if (!value) {
      this.model.update(model => ({ ...model, customerId: "" }))
      return
    }
    if (!this.customerOptions().some(option => option.value === value)) return
    this.model.update(model => ({ ...model, customerId: value }))
  }

  /** Explicit retry of the finite type catalog only; the customer page is untouched. */
  loadTypes(force = false): void {
    if (!this.current() || this.pending()) return
    this.typeAdmissionError.set(false)
    this.store
      .observeRequestTypes(force)
      .pipe(
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

  /** Pickers do not blur a field, so a submission attempt must surface both choice errors. */
  private touchChoices(): void {
    this.profile.customerId().markAsTouched()
    this.profile.requestTypeId().markAsTouched()
  }

  save(): Promise<boolean> {
    if (!this.current() || this.pending()) return Promise.resolve(false)
    this.error.set("")
    this.touchChoices()
    return submit(this.profile, async () => {
      const value = this.model()
      if (!this.current() || this.store.writing()) return
      if (!this.validCustomer(value.customerId) || !this.validType(value.requestTypeId)) {
        this.error.set("Actualiza los catálogos de las opciones seleccionadas antes de guardar.")
        return
      }
      const subject = value.subject.trim()
      const description = value.description.trim()
      if (
        !subject ||
        subject.length > subjectLimit ||
        !description ||
        description.length > descriptionLimit
      )
        return
      try {
        const result = await firstValueFrom(
          this.store
            .createRequest({
              // Staff creation always names the customer; no identity is inferred.
              customerId: Number(value.customerId),
              orderId: null,
              requestTypeId: Number(value.requestTypeId),
              subject,
              description
            })
            .pipe(
              takeUntil(this.lifecycle.cancelled$),
              takeUntilDestroyed(this.destroyRef),
              takeUntilDestroyed(this.context.owner)
            ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success) this.error.set(this.writeError(result.error.code))
        else {
          this.context.onCreated()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current())
          this.error.set("No se pudo confirmar el alta. Consulta la bandeja antes de reintentar.")
      }
    })
  }

  private writeError(code: CustomerSupportErrorCode): string {
    switch (code) {
      case "FORBIDDEN":
        return "No tienes permiso para crear esta atención."
      case "VALIDATION":
        return "Revisa el asunto, la descripción y las opciones seleccionadas."
      case "NOT_FOUND":
        return "El cliente o el tipo ya no están disponibles. Revisa las opciones."
      case "CONFLICT":
        return "Hay otra operación en curso. Espera un momento y reintenta."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNAVAILABLE":
        return "El servicio de soporte no está disponible en este momento."
      default:
        return "No se pudo confirmar el alta. Consulta la bandeja antes de reintentar."
    }
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.pending() && this.dialog.open) this.dialog.close()
  }
}
