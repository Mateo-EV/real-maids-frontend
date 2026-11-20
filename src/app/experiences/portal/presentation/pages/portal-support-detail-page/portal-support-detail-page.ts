import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, RouterLink } from "@angular/router"
import { distinctUntilChanged, EMPTY, map, Subject, switchMap, takeUntil } from "rxjs"
import { HlmAlert, HlmAlertDescription, HlmAlertTitle } from "@spartan-ng/helm/alert"
import { HlmBadge } from "@spartan-ng/helm/badge"
import { HlmButton } from "@spartan-ng/helm/button"
import {
  HlmEmpty,
  HlmEmptyDescription,
  HlmEmptyHeader,
  HlmEmptyTitle
} from "@spartan-ng/helm/empty"
import { HlmSpinner } from "@spartan-ng/helm/spinner"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { SupportFollowUpView } from "@/app/features/customer-support/domain/models/support-views"
import { SupportRequestsStore } from "@/app/features/customer-support/presentation/state/support-requests.store"
import {
  portalPageContext,
  portalPagingParams,
  portalRouteId
} from "@/app/experiences/portal/presentation/navigation/portal-paging"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"

type DetailField = readonly [label: string, value: string | number | null]

// S7: the backend redacts the staff author as a null `autor`. The portal states that absence
// explicitly instead of borrowing a name, an id, a role or any other field of the record.
export const redactedAuthorLabel = "Autor no mostrado"

/**
 * WP10 T5 / S7 — `/portal/support/:id`, one of the customer's own support attentions, read-only.
 *
 * The backend scopes every attention read to the caller, so this consumer never sends a customer id,
 * never claims ownership and never infers a permission. An attention that is not the caller's
 * answers `404`: that is rendered as «no disponible», never as a permission hint and never as a
 * transient failure with a retry, because repeating the same GET cannot change the answer.
 *
 * The states are the backend's closed vocabulary with its supplied display name: the page prints
 * that text as received and derives, translates and invents nothing. No transition is offered —
 * which target state is legal is the staff screen's and the backend's authority.
 *
 * Privacy on this surface: a follow-up whose author is null renders an explicit redacted case, and
 * no internal staff contact data is projected anywhere. Nothing here writes: no reply, no state
 * change, no close and no administrative destination.
 *
 * Freshness (30000 ms, success-only), shared ref-counted reads, same-id stale data and session
 * fencing stay in the existing root `SupportRequestsStore`; this page owns only its route identity,
 * its state feedback and its GET-only retry.
 *
 * Helm dependencies are declared by name, never as a spread of an imported `*Imports` constant: the
 * dev server re-applies this metadata through `ɵɵnamespaces` and resolves those entries by index,
 * which threw `Cannot read properties of undefined (reading 'HlmSpinner')` here and left the page's
 * metadata broken whenever that array and the loaded chunk disagreed.
 */
@Component({
  selector: "app-portal-support-detail-page",
  imports: [
    RouterLink,
    CatalogFrame,
    BadgeTone,
    HlmAlert,
    HlmAlertDescription,
    HlmAlertTitle,
    HlmBadge,
    HlmButton,
    HlmEmpty,
    HlmEmptyDescription,
    HlmEmptyHeader,
    HlmEmptyTitle,
    HlmSpinner
  ],
  templateUrl: "./portal-support-detail-page.html"
})
export class PortalSupportDetailPage {
  private readonly route = inject(ActivatedRoute)
  private readonly destroyRef = inject(DestroyRef)
  private readonly support = inject(SupportRequestsStore)
  /** `null` cancels the current observation without issuing a replacement read. */
  private readonly loads = new Subject<{ id: number; force: boolean } | null>()
  private readonly params = signal(this.route.snapshot.queryParamMap)
  readonly id = signal<number | null>(null)
  /** The explicit redaction copy; the template never falls back to another field. */
  readonly redactedAuthor = redactedAuthorLabel
  private readonly scope = createSessionReadScope(() => {
    // A replaced session must not inherit the previous identity's read or its verified record.
    this.loads.next(null)
    const generation = this.scope.generation()
    queueMicrotask(() => {
      if (!this.current(generation)) return
      const id = this.id()
      if (id !== null) this.load(id, false)
    })
  })
  readonly detail = computed(() => {
    const id = this.id()
    return id === null ? undefined : this.support.selectRequest(id)
  })
  /** Authoritative absence: the backend answered 404 for this caller. */
  readonly notFound = computed(() => this.detail()?.error?.code === "NOT_FOUND")
  readonly invalid = computed(() => this.id() === null)
  readonly unavailable = computed(() => this.invalid() || this.notFound())
  readonly record = computed(() => {
    const id = this.id()
    const result = this.detail()?.result
    return this.unavailable() || result?.request.id !== id ? undefined : result
  })
  /** Only a retryable failure reaches this projection; a 404 has its own state. */
  readonly error = computed(() => {
    const error = this.detail()?.error
    return error && error.code !== "NOT_FOUND" ? error : undefined
  })
  /** The return link carries the same effective page, through the portal's paging contract. */
  readonly backContext = computed(() => portalPagingParams(portalPageContext(this.params())))
  /** Supplied fields only, printed literally: no invented state, owner, actor or total. */
  readonly profile = computed<readonly DetailField[]>(() => {
    const attention = this.record()?.request
    return attention
      ? [
          ["Atención (ID)", attention.id],
          ["Tipo de atención", attention.requestTypeName],
          // Explicit offsets become UTC instants; neither date is re-zoned for display.
          ["Registro (UTC)", attention.registeredAt.toISOString()],
          ["Cierre (UTC)", attention.closedAt ? attention.closedAt.toISOString() : null]
        ]
      : []
  })
  /** Server order, untouched: the store keeps the returned array as it arrived. */
  readonly followUps = computed<readonly SupportFollowUpView[]>(
    () => this.record()?.followUps ?? []
  )
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "FORBIDDEN":
        return "No puedes consultar esta atención. Vuelve a Soporte."
      case "INVALID_RESPONSE":
        return "La respuesta del servicio no es válida. Reintenta la consulta."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNAVAILABLE":
        return "El servicio de soporte no está disponible en este momento."
      default:
        return "No se pudo cargar la atención. Inténtalo de nuevo."
    }
  })

  constructor() {
    this.loads
      .pipe(
        switchMap(load =>
          load === null
            ? EMPTY
            : this.support
                .observeRequest(load.id, load.force)
                .pipe(takeUntil(this.scope.cancelled$))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    // Route identity only: `distinctUntilChanged` keeps a repeated URL from restarting the read.
    this.route.paramMap
      .pipe(
        map(params => portalRouteId(params)),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(id => {
        this.id.set(id)
        if (id === null) this.loads.next(null)
        else this.load(id, false)
      })
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.params.set(params))
  }

  /**
   * The supplied author as it arrived, or `null` when the backend redacted it. The template renders
   * that absence as its own explicit case; no field of the record stands in for the identity.
   */
  authorName(followUp: SupportFollowUpView): string | null {
    return followUp.author
  }

  /** Only the supplied orientation, never an identity. */
  originLabel(followUp: SupportFollowUpView): string {
    return followUp.isFromCustomer ? "Del cliente" : "Del personal"
  }

  /** Explicit retry: re-issues the same GET and nothing else. */
  retry(): void {
    const id = this.id()
    const detail = this.detail()
    if (this.destroyRef.destroyed || id === null || detail?.loading || detail?.refreshing) return
    this.load(id, true)
  }

  private current(generation: number): boolean {
    return (
      !this.destroyRef.destroyed && this.scope.check() && generation === this.scope.generation()
    )
  }

  private load(id: number, force: boolean): void {
    if (this.destroyRef.destroyed || !this.scope.check()) return
    this.loads.next({ id, force })
  }
}
