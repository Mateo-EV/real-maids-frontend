import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, RouterLink } from "@angular/router"
import { distinctUntilChanged, EMPTY, map, Subject, switchMap, takeUntil } from "rxjs"
import { HlmAlert, HlmAlertDescription, HlmAlertTitle } from "@spartan-ng/helm/alert"
import { HlmBadge } from "@spartan-ng/helm/badge"
import { HlmButton } from "@spartan-ng/helm/button"
import { HlmSpinner } from "@spartan-ng/helm/spinner"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { ServiceRequestsStore } from "@/app/features/operations/presentation/state/service-requests.store"
import {
  serviceRequestPageContext,
  serviceRequestPagingParams,
  serviceRequestRouteId
} from "@/app/features/operations/presentation/navigation/service-request-page-context"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"

type DetailField = readonly [label: string, value: string | number | null]

/**
 * WP10 T3 / S7 — `/portal/requests/:id`, one of the customer's own service requests, read-only.
 *
 * The backend scopes every request read to the caller, so this consumer never sends a customer id,
 * never claims ownership and never infers a permission. A request that is not the caller's answers
 * `404`: that is rendered as «no disponible», never as a permission hint and never as a transient
 * failure with a retry, because repeating the same GET cannot change the answer.
 *
 * Freshness (30000 ms, success-only), shared ref-counted reads, same-id stale data and session
 * fencing stay in the existing root store; this page owns only its route identity, its state
 * feedback, its cancellation and its GET-only retry. Nothing here writes: no cancel, no edit, no
 * status action and no administrative destination exists in the customer portal.
 *
 * Helm dependencies are declared by name, never as a spread of an imported `*Imports` constant: the
 * dev server re-applies this metadata through `ɵɵnamespaces` and resolves those entries by index,
 * which threw `Cannot read properties of undefined (reading 'HlmSpinner')` here and left the page's
 * metadata broken whenever that array and the loaded chunk disagreed.
 */
@Component({
  selector: "app-portal-request-detail-page",
  imports: [
    RouterLink,
    CatalogFrame,
    BadgeTone,
    HlmAlert,
    HlmAlertDescription,
    HlmAlertTitle,
    HlmBadge,
    HlmButton,
    HlmSpinner
  ],
  templateUrl: "./portal-request-detail-page.html"
})
export class PortalRequestDetailPage {
  private readonly route = inject(ActivatedRoute)
  private readonly destroyRef = inject(DestroyRef)
  private readonly requests = inject(ServiceRequestsStore)
  /** `null` cancels the current observation without issuing a replacement read. */
  private readonly loads = new Subject<{ id: number; force: boolean } | null>()
  private readonly params = signal(this.route.snapshot.queryParamMap)
  readonly id = signal<number | null>(null)
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
    return id === null ? undefined : this.requests.selectRequest(id)
  })
  /** Authoritative absence: the backend answered 404 for this caller. */
  readonly notFound = computed(() => this.detail()?.error?.code === "NOT_FOUND")
  readonly invalid = computed(() => this.id() === null)
  readonly unavailable = computed(() => this.invalid() || this.notFound())
  readonly record = computed(() => {
    const id = this.id()
    const result = this.detail()?.result
    return this.unavailable() || result?.id !== id ? undefined : result
  })
  /** Only a retryable failure reaches this projection; a 404 has its own state. */
  readonly error = computed(() => {
    const error = this.detail()?.error
    return error && error.code !== "NOT_FOUND" ? error : undefined
  })
  readonly backContext = computed(() =>
    serviceRequestPagingParams(serviceRequestPageContext(this.params()))
  )
  /** Supplied fields only, printed literally: no invented status, owner, total or amount. */
  readonly profile = computed<readonly DetailField[]>(() => {
    const request = this.record()
    return request
      ? [
          ["Solicitud (ID)", request.id],
          ["Propiedad", request.propertyName],
          ["Tipo de servicio", request.serviceTypeName],
          ["Fecha deseada", request.desiredDate],
          ["Registro (UTC)", request.registeredAt.toISOString()],
          ["Última actualización (UTC)", request.updatedAt?.toISOString() ?? null]
        ]
      : []
  })
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "FORBIDDEN":
        return "No puedes consultar esta solicitud. Vuelve a Mis solicitudes."
      case "INVALID_RESPONSE":
        return "La respuesta del servicio no es válida. Reintenta la consulta."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
      case "UNAVAILABLE":
        return "El servicio de solicitudes no está disponible en este momento."
      default:
        return "No se pudo cargar la solicitud. Inténtalo de nuevo."
    }
  })

  constructor() {
    this.loads
      .pipe(
        switchMap(load =>
          load === null
            ? EMPTY
            : this.requests
                .observeRequest(load.id, load.force)
                .pipe(takeUntil(this.scope.cancelled$))
        ),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
    // Route identity only: `distinctUntilChanged` keeps a repeated URL from restarting the read.
    this.route.paramMap
      .pipe(
        map(params => serviceRequestRouteId(params.get("id"))),
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
