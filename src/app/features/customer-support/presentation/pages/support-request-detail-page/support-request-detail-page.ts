import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, ParamMap, RouterLink } from "@angular/router"
import {
  catchError,
  distinctUntilChanged,
  EMPTY,
  map,
  startWith,
  Subject,
  switchMap,
  takeUntil,
  tap
} from "rxjs"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmEmptyImports } from "@spartan-ng/helm/empty"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"
import { CustomerSupportError } from "../../../domain/errors/customer-support.error"
import { SupportFollowUpView } from "../../../domain/models/support-views"
import { SupportRequestsStore } from "../../state/support-requests.store"
import { supportPageContext, supportRouteId } from "../support-page-context"

type DetailField = readonly [label: string, value: string | number | null]

// S7: the backend redacts the staff author as a null `autor`; the label states that
// absence instead of falling back to another field of the record.
const redactedAuthor = "Autor no mostrado"

@Component({
  selector: "app-support-request-detail-page",
  imports: [
    RouterLink,
    CatalogFrame,
    HlmAlertImports,
    HlmBadgeImports,
    BadgeTone,
    HlmButtonImports,
    HlmEmptyImports,
    HlmSpinnerImports
  ],
  templateUrl: "./support-request-detail-page.html"
})
export class SupportRequestDetailPage {
  private readonly route = inject(ActivatedRoute)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(SupportRequestsStore)
  private readonly retries = new Subject<boolean>()
  private readonly ownerChanged = new Subject<void>()
  private readonly observationError = signal<CustomerSupportError | undefined>(undefined)
  private readonly params = signal<ParamMap>(this.route.snapshot.queryParamMap)
  private readonly ownerActive = signal(false)
  private ownerGeneration = -1
  private readonly scope = createSessionReadScope(() => this.stopOwner())

  readonly id = signal<number | null>(null)
  readonly ownerRevision = signal(0)
  // Only the paging the inbox owns travels in the URL; filters stay page state.
  readonly backContext = computed(() => supportPageContext(this.params()))
  // Root state owns TTL, flights and session fencing; this page only observes its own id.
  readonly detail = computed(() => {
    const id = this.id()
    return id === null || !this.ownerActive() ? undefined : this.store.selectRequest(id)
  })
  readonly selected = computed(() => {
    const result = this.detail()?.result
    return result && result.request.id === this.id() ? result : undefined
  })
  readonly request = computed(() => this.selected()?.request)
  readonly followUps = computed<readonly SupportFollowUpView[]>(
    () => this.selected()?.followUps ?? []
  )
  readonly error = computed(() => this.detail()?.error ?? this.observationError())
  readonly busy = computed(() => !!this.detail()?.loading || !!this.detail()?.refreshing)
  readonly orderId = computed(() => this.request()?.orderId ?? null)
  readonly orderCode = computed(() => this.request()?.orderCode ?? null)
  readonly fields = computed<readonly DetailField[]>(() => {
    const request = this.request()
    return request
      ? [
          ["Cliente", request.customerName],
          ["Cliente (ID)", request.customerId],
          ["Tipo de atención (ID)", request.requestTypeId],
          [
            "Requiere respuesta",
            request.requiresResponse ? "Sí, requiere respuesta" : "No requiere respuesta"
          ],
          // Explicit offsets become UTC instants; neither date is re-zoned for display.
          ["Registro (UTC)", request.registeredAt.toISOString()],
          ["Cierre (UTC)", request.closedAt ? request.closedAt.toISOString() : null]
        ]
      : []
  })
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "NOT_FOUND":
        return "No se encontró la atención."
      case "FORBIDDEN":
        return "No tienes permiso para consultar esta atención."
      case "INVALID_RESPONSE":
        return "La respuesta del servicio no es válida. Reintenta la consulta."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "VALIDATION":
        return "El identificador de la atención no es válido."
      case "UNAVAILABLE":
        return "El servicio de soporte no está disponible en este momento."
      default:
        return "No se pudo cargar la atención. Inténtalo de nuevo."
    }
  })

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopOwner()
      this.ownerChanged.complete()
      this.retries.complete()
    })
    // Query-only changes replace the return context without restarting the same-id read.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.params.set(params))
    this.route.paramMap
      .pipe(
        map(params => supportRouteId(params.get("id"))),
        distinctUntilChanged(),
        switchMap(id => {
          // switchMap releases the previous observation before replacement data can be
          // selected, so a late completion never paints another id's record.
          this.stopOwner()
          this.id.set(id)
          if (id === null || !this.scope.check()) return EMPTY
          this.ownerGeneration = this.scope.generation()
          this.ownerActive.set(true)
          const revision = this.ownerRevision()
          return this.retries.pipe(
            startWith(false),
            switchMap(force => {
              if (!this.current(id, revision)) return EMPTY
              this.observationError.set(undefined)
              return this.store.observeRequest(id, force).pipe(
                tap(result => {
                  if (!this.current(id, revision)) return
                  // An admission failure has no root entry, so only its safe error is kept
                  // here. Verified data is never copied into local state.
                  this.observationError.set(
                    !result.success && !this.store.selectRequest(id).error
                      ? result.error
                      : undefined
                  )
                }),
                catchError(() => {
                  if (this.current(id, revision))
                    this.observationError.set(new CustomerSupportError("UNEXPECTED"))
                  return EMPTY
                })
              )
            }),
            takeUntil(this.ownerChanged),
            takeUntil(this.scope.cancelled$)
          )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }

  /** The supplied author is shown as it arrived; a null author is stated, never inferred. */
  authorLabel(followUp: SupportFollowUpView): string {
    return followUp.author ?? redactedAuthor
  }

  originLabel(followUp: SupportFollowUpView): string {
    return followUp.isFromCustomer ? "Del cliente" : "Del personal"
  }

  /** GET-only retry of the observed id: this consumer never replays a write. */
  retry(): void {
    if (!this.current(this.id(), this.ownerRevision())) return
    const detail = this.detail()
    if (detail?.loading || detail?.refreshing) return
    this.retries.next(true)
  }

  private current(id: number | null, revision: number): boolean {
    return (
      !this.destroyRef.destroyed &&
      id !== null &&
      id === this.id() &&
      revision === this.ownerRevision() &&
      this.ownerActive() &&
      this.scope.check() &&
      this.ownerGeneration === this.scope.generation()
    )
  }

  private stopOwner(): void {
    this.ownerActive.set(false)
    this.ownerGeneration = -1
    this.observationError.set(undefined)
    this.ownerRevision.update(revision => revision + 1)
  }
}
