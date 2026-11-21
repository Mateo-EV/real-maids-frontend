import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  OnInit,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { disabled, form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { Router, RouterLink } from "@angular/router"
import { catchError, EMPTY, firstValueFrom, Subject, switchMap, takeUntil, tap } from "rxjs"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideCircleAlert, lucideLifeBuoy } from "@ng-icons/lucide"
import { HlmAlert, HlmAlertDescription, HlmAlertTitle } from "@spartan-ng/helm/alert"
import { HlmButton } from "@spartan-ng/helm/button"
import {
  HlmCard,
  HlmCardContent,
  HlmCardDescription,
  HlmCardHeader,
  HlmCardTitle
} from "@spartan-ng/helm/card"
import {
  HlmField,
  HlmFieldDescription,
  HlmFieldError,
  HlmFieldLabel,
  HlmFieldLegend,
  HlmFieldSet
} from "@spartan-ng/helm/field"
import { HlmInput } from "@spartan-ng/helm/input"
import { HlmNativeSelect } from "@spartan-ng/helm/native-select"
import { HlmSpinner } from "@spartan-ng/helm/spinner"
import { HlmTextarea } from "@spartan-ng/helm/textarea"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CustomerSupportErrorCode } from "@/app/features/customer-support/domain/errors/customer-support.error"
import { SupportRequestTypeView } from "@/app/features/customer-support/domain/models/support-views"
import { SupportRequestsStore } from "@/app/features/customer-support/presentation/state/support-requests.store"
import { ServiceOrderSummary } from "@/app/features/operations/domain/models/operations-read.models"
import { ServiceOrdersStore } from "@/app/features/operations/presentation/state/service-orders.store"
import { portalFirstPage } from "@/app/experiences/portal/presentation/navigation/portal-paging"
import {
  CatalogCombobox,
  CatalogComboboxOption
} from "@/app/shared/components/catalog-combobox/catalog-combobox"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"

type OrderQuery = Required<PaginationParams>

// The shared portal contract owns the documented first page; this page keeps no copy of it.
const firstPage: Readonly<OrderQuery> = portalFirstPage
/** Documented wire limits for the create payload; over-limit text is refused, never truncated. */
const subjectLimit = 150
const descriptionLimit = 4000
const positiveId = (value: string) => /^[1-9]\d*$/.test(value) && Number(value) <= 2147483647

/** Only supplied fields: the order code, its supplied state text and the service it belongs to. */
const orderLabel = (order: ServiceOrderSummary) =>
  `${order.code} · ${order.serviceTypeName} · ${order.propertyName}`

/**
 * WP10 T6 / S7 — `/portal/support/new`, the only write in the customer portal: the customer
 * registers one support attention in their own name (M09/RF11/HU11/P10; RNF09/RNF10/RNF12).
 *
 * Own audience means `idCliente: null`: the backend resolves the customer from the session, so this
 * form never sends, infers, displays or asks for a customer identity, and there is no customer
 * picker at all. It also never offers a staff or administrative action.
 *
 * The payload is exactly `idTipo`, `asunto`, `descripcion` and — only when the customer chose one of
 * their own services from a verified caller-scoped `GET /api/ordenes` page — `idOrden`. There is no
 * typed order id: the choice can only come from an option the own-orders read actually returned, and
 * it is re-verified against that read at dispatch. The service is explicitly optional.
 *
 * Write discipline: one POST through the existing root `SupportRequestsStore.createRequest` (never a
 * second HTTP path), a pending gate that refuses duplicate submissions and refuses to leave the page,
 * inline errors that keep the draft, and no replay of the POST after any outcome the client cannot
 * prove. Feedback follows a confirmed success only, and then the created detail opens; if the answer
 * carries no usable id the customer returns to the list with the confirmed message instead of a
 * guessed destination. A session replacement or route destruction fences the answer so nothing from
 * a previous identity navigates, reports or clears another session's work.
 *
 * Dependencies are declared as the directive and component classes the template uses, imported
 * directly. Angular hands a directly imported value to the metadata the dev server re-applies as a
 * plain argument, while a spread of an imported `*Imports` constant has to be re-resolved through the
 * dev server's `ɵɵnamespaces` array, where a revision skew between that array and the loaded chunk
 * threw `Cannot read properties of undefined (reading 'HlmTextarea')` and left this form unrendered.
 * Naming the classes of each Helm group keeps exactly the same directive set.
 */
@Component({
  selector: "app-portal-support-create-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    FormField,
    FormRoot,
    NgIcon,
    CatalogCombobox,
    HlmAlert,
    HlmAlertDescription,
    HlmAlertTitle,
    HlmButton,
    HlmCard,
    HlmCardContent,
    HlmCardDescription,
    HlmCardHeader,
    HlmCardTitle,
    HlmField,
    HlmFieldDescription,
    HlmFieldError,
    HlmFieldLabel,
    HlmFieldLegend,
    HlmFieldSet,
    HlmInput,
    HlmNativeSelect,
    HlmSpinner,
    HlmTextarea
  ],
  providers: [provideIcons({ lucideCircleAlert, lucideLifeBuoy })],
  templateUrl: "./portal-support-create-page.html"
})
export class PortalSupportCreatePage implements OnInit {
  private readonly support = inject(SupportRequestsStore)
  private readonly orders = inject(ServiceOrdersStore)
  private readonly router = inject(Router)
  private readonly destroyRef = inject(DestroyRef)
  readonly subjectLimit = subjectLimit
  readonly descriptionLimit = descriptionLimit
  /** Draft only: the payload is built at dispatch, never derived from anything else. */
  readonly model = signal({
    requestTypeId: "",
    orderId: "",
    subject: "",
    description: ""
  })
  /** The retained own-service choice with the label it was offered under. */
  private readonly orderChoice = signal<{ value: string; label: string } | null>(null)
  private readonly requestedOrders = signal<OrderQuery>(firstPage)
  /** `null` cancels the current own-orders read without issuing a replacement one. */
  private readonly orderQueries = new Subject<{ query: OrderQuery; force: boolean } | null>()
  private readonly typeAdmissionError = signal(false)
  private readonly orderAdmissionError = signal(false)
  /**
   * Ids this session's own-orders reads actually returned, with the freshness of the read that
   * returned them. Options are rendered from the store page; this is only the dispatch receipt that
   * makes "one of the customer's own services" checkable instead of trusted.
   */
  private readonly verifiedOrders = signal<ReadonlyMap<number, number>>(new Map())
  /** The draft could not be left behind because a write is in flight. */
  readonly leaveBlocked = signal(false)
  readonly error = signal("")
  /** The client cannot prove whether this POST reached the backend. */
  readonly ambiguous = signal(false)
  /** A confirmed creation allows the navigation it triggers itself. */
  private completed = false
  private readonly scope = createSessionReadScope(() => {
    // A replaced session must not inherit the previous identity's draft, choices or receipts.
    this.orderQueries.next(null)
    this.completed = false
    this.error.set("")
    this.ambiguous.set(false)
    this.leaveBlocked.set(false)
    this.orderChoice.set(null)
    this.verifiedOrders.set(new Map())
    this.requestedOrders.set(firstPage)
    this.model.set({ requestTypeId: "", orderId: "", subject: "", description: "" })
    const generation = this.scope.generation()
    // The fenced write settles on its own microtasks and the form leaves its submitting state on the
    // same turn, so the replacement session admits its reads on the next macrotask instead of
    // inheriting the previous identity's pending state.
    setTimeout(() => {
      if (!this.current(generation)) return
      this.loadTypes()
      this.loadOrders()
    }, 0)
  })

  readonly typeEntry = computed(() => this.support.selectRequestTypes())
  readonly typeBusy = computed(() => this.typeEntry().loading || this.typeEntry().refreshing)
  readonly typeFailed = computed(() => !!this.typeEntry().error || this.typeAdmissionError())
  /** The supplied catalog is the only vocabulary; there is no status catalog to offer. */
  readonly typeOptions = computed<readonly CatalogComboboxOption[]>(() => {
    const loaded: SupportRequestTypeView[] = this.typeEntry().result ?? []
    const options = loaded.map(type => ({ value: String(type.id), label: type.name }))
    const value = this.model().requestTypeId
    if (!value || options.some(option => option.value === value)) return options
    return [...options, { value, label: "Tipo no disponible en el catálogo actual" }]
  })

  readonly orderEntry = computed(() => this.orders.selectOrders(this.requestedOrders()))
  readonly orderPage = computed(() => this.orderEntry().result)
  readonly orderBusy = computed(() => this.orderEntry().loading || this.orderEntry().refreshing)
  readonly orderFailed = computed(() => !!this.orderEntry().error || this.orderAdmissionError())
  /** Effective server metadata of the own-orders page, never the requested one. */
  readonly orderQuery = computed<OrderQuery>(() => {
    const page = this.orderPage()
    return page ? { offset: page.offset, limit: page.limit } : this.requestedOrders()
  })
  readonly currentOrderPage = computed(
    () => Math.floor(this.orderQuery().offset / this.orderQuery().limit) + 1
  )
  readonly orderPageCount = computed(() =>
    Math.max(1, Math.ceil((this.orderPage()?.total ?? 0) / this.orderQuery().limit))
  )
  /** Only the verified page plus the retained choice, whose captured label is never invented. */
  readonly orderOptions = computed<readonly CatalogComboboxOption[]>(() => {
    const loaded = (this.orderPage()?.items ?? []).map(order => ({
      value: String(order.id),
      label: orderLabel(order)
    }))
    const choice = this.orderChoice()
    if (!choice || loaded.some(option => option.value === choice.value)) return loaded
    return [
      ...loaded,
      { value: choice.value, label: `${choice.label} · no disponible en esta página` }
    ]
  })
  readonly orderLabel = computed(() => this.orderChoice()?.label ?? "")
  readonly pending = computed(() => this.profile().submitting() || this.support.writing())

  readonly profile = form(this.model, path => {
    disabled(path, () => this.pending())
    validate(path.requestTypeId, ({ value }) =>
      this.verifiedType(value())
        ? undefined
        : { kind: "choice", message: "Selecciona un tipo de atención verificado." }
    )
    // Absent is valid: the own service is optional. A value must come from a verified own read.
    validate(path.orderId, ({ value }) =>
      this.verifiedOrder(value())
        ? undefined
        : {
            kind: "choice",
            message: "Actualiza tus servicios y elige el servicio de nuevo."
          }
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

  ngOnInit(): void {
    this.orderQueries
      .pipe(
        switchMap(request => {
          if (!request) return EMPTY
          this.requestedOrders.set(request.query)
          this.orderAdmissionError.set(false)
          const generation = this.scope.generation()
          return this.orders.observeOrders(request.query, request.force).pipe(
            takeUntil(this.scope.cancelled$),
            tap(result => {
              if (result.success && this.current(generation))
                this.recordVerifiedOrders(request.query)
            }),
            catchError(() => {
              if (this.current(generation)) this.orderAdmissionError.set(true)
              return EMPTY
            })
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(result => {
        if (!result || result.success || !this.current()) return
        if (!this.orderEntry().error) this.orderAdmissionError.set(true)
      })
    if (!this.scope.check()) return
    this.loadTypes()
    this.loadOrders()
  }

  /** Explicit retry of the supplied type catalog only; the own-orders read is untouched. */
  loadTypes(force = false): void {
    if (!this.current() || this.pending()) return
    this.typeAdmissionError.set(false)
    this.support
      .observeRequestTypes(force)
      .pipe(
        takeUntil(this.scope.cancelled$),
        takeUntilDestroyed(this.destroyRef),
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

  /** One own-orders page; never a downloaded catalog and never a global list. */
  loadOrders(force = false): void {
    if (!this.current() || this.pending()) return
    this.orderQueries.next({ query: this.requestedOrders(), force })
  }

  goToOrderPage(page: number): void {
    if (
      !this.current() ||
      this.pending() ||
      this.orderBusy() ||
      !this.orderPage() ||
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > this.orderPageCount() ||
      page === this.currentOrderPage()
    )
      return
    this.orderQueries.next({
      query: { offset: (page - 1) * this.orderQuery().limit, limit: this.orderQuery().limit },
      force: false
    })
  }

  /** Only an offered value becomes the choice; clearing it is the only way to drop it. */
  orderChanged(value: string): void {
    if (!this.current() || this.pending()) return
    if (value === this.model().orderId) return
    if (!value) {
      this.orderChoice.set(null)
      this.model.update(model => ({ ...model, orderId: "" }))
      return
    }
    const option = this.orderOptions().find(candidate => candidate.value === value)
    if (!option) return
    this.orderChoice.set({ value: option.value, label: option.label })
    this.model.update(model => ({ ...model, orderId: option.value }))
  }

  clearOrder(): void {
    if (!this.current() || this.pending()) return
    this.orderChanged("")
  }

  /** The router's seam: a write in flight does not abandon the page. */
  canLeave(): boolean {
    return this.completed || !this.pending()
  }

  /** A refused navigation is reported, so the pending state is not a silent trap. */
  blockLeave(): void {
    this.leaveBlocked.set(true)
  }

  save(): Promise<boolean> {
    if (!this.current() || this.pending()) return Promise.resolve(false)
    this.error.set("")
    this.ambiguous.set(false)
    this.leaveBlocked.set(false)
    // Pickers and selects do not blur a field, so a submission attempt surfaces every choice error.
    this.profile.requestTypeId().markAsTouched()
    this.profile.orderId().markAsTouched()
    return submit(this.profile, async () => {
      const value = this.model()
      if (!this.current()) return
      if (!this.verifiedType(value.requestTypeId)) {
        this.error.set("Actualiza el catálogo de tipos antes de guardar.")
        return
      }
      if (!this.verifiedOrder(value.orderId)) {
        this.error.set("Actualiza tus servicios y elige el servicio otra vez.")
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
      const orderId = value.orderId ? Number(value.orderId) : null
      try {
        // The observation is never cancelled here: the store owns the fence and completes the
        // stream on a session change, so this await always settles instead of hanging the form.
        const result = await firstValueFrom(
          this.support
            .createRequest({
              // Own audience: the backend resolves the customer from the session.
              customerId: null,
              orderId,
              requestTypeId: Number(value.requestTypeId),
              subject,
              description
            })
            .pipe(takeUntilDestroyed(this.destroyRef)),
          { defaultValue: undefined }
        )
        if (!this.current()) return
        this.leaveBlocked.set(false)
        if (!result) return
        if (!result.success) {
          this.fail(result.error.code)
          return
        }
        const id = result.data.request.id
        this.completed = true
        // A confirmed write only: navigate to the created record, or back to the list with the
        // confirmed message when the answer carries no usable id.
        await (Number.isSafeInteger(id) && id > 0
          ? this.router.navigate(["/portal/support", id])
          : this.router.navigate(["/portal/support"], { queryParams: { creada: "1" } }))
      } catch {
        if (this.current()) this.fail("UNEXPECTED")
      }
    })
  }

  cancel(): void {
    if (this.destroyRef.destroyed || this.pending()) return
    void this.router.navigateByUrl("/portal/support")
  }

  clearFailure(): void {
    this.error.set("")
    this.ambiguous.set(false)
  }

  /**
   * A choice is dispatchable only while the verified entry that produced it is current: a failed,
   * expired or in-flight catalog cannot authorize the payload.
   */
  private verifiedType(value: string): boolean {
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

  /** Absent is allowed; a present id must be one this session's own-orders read returned. */
  private verifiedOrder(value: string): boolean {
    if (!value) return true
    if (!positiveId(value)) return false
    const expires = this.verifiedOrders().get(Number(value))
    return expires !== undefined && expires > Date.now()
  }

  /** The given page is verified *after* the read: only then does it authorize an order choice. */
  private recordVerifiedOrders(query: OrderQuery): void {
    const entry = this.orders.selectOrders(query)
    const page = entry.result
    if (!page || entry.error || entry.loading || entry.refreshing || entry.expires <= Date.now())
      return
    const verified = new Map(this.verifiedOrders())
    for (const order of page.items) verified.set(order.id, entry.expires)
    this.verifiedOrders.set(verified)
  }

  private current(generation?: number): boolean {
    return (
      !this.destroyRef.destroyed &&
      this.scope.check() &&
      (generation === undefined || generation === this.scope.generation())
    )
  }

  private fail(code: CustomerSupportErrorCode): void {
    switch (code) {
      case "FORBIDDEN":
        this.ambiguous.set(false)
        this.error.set("No tienes permiso para registrar esta atención.")
        return
      case "VALIDATION":
        this.ambiguous.set(false)
        this.error.set("Revisa el asunto, la descripción y las opciones seleccionadas.")
        return
      case "NOT_FOUND":
        this.ambiguous.set(false)
        this.error.set("El tipo de atención o el servicio elegido ya no están disponibles.")
        return
      case "CONFLICT":
        this.ambiguous.set(false)
        this.error.set("Hay otra operación en curso. Espera un momento y vuelve a enviar.")
        return
      case "UNAUTHENTICATED":
        this.ambiguous.set(false)
        this.error.set("La sesión no está disponible. Vuelve a iniciar sesión.")
        return
      default:
        // Nothing here proves whether the POST reached the backend, so the copy says so and the
        // page never resends on its own.
        this.ambiguous.set(true)
        this.error.set(
          "No pudimos confirmar el registro. Revisa «Soporte» antes de volver a intentarlo; no repetimos el envío por ti."
        )
    }
  }
}
