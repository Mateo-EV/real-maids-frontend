import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, RouterLink } from "@angular/router"
import { distinctUntilChanged, EMPTY, map, Subject, switchMap, takeUntil } from "rxjs"
import { HlmAlert, HlmAlertDescription, HlmAlertTitle } from "@spartan-ng/helm/alert"
import { HlmBadge } from "@spartan-ng/helm/badge"
import { HlmButton } from "@spartan-ng/helm/button"
import { HlmSpinner } from "@spartan-ng/helm/spinner"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { ServiceOrdersStore } from "@/app/features/operations/presentation/state/service-orders.store"
import {
  portalPageContext,
  portalPagingParams,
  portalRouteId
} from "@/app/experiences/portal/presentation/navigation/portal-paging"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"

type DetailField = readonly [label: string, value: string | number | null]

/**
 * WP10 T4 / S7 — `/portal/services/:id`, one of the customer's own service orders, read-only.
 *
 * The backend scopes every order read to the caller, so this consumer never sends a customer id,
 * never claims ownership and never infers a permission. An order that is not the caller's answers
 * `404`: that is rendered as «no disponible», never as a permission hint and never as a transient
 * failure with a retry, because repeating the same GET cannot change the answer.
 *
 * This is the customer-facing surface, so the detail wrapper is projected narrowly: the property
 * block's access instructions and door codes stay on the operational screen and are never printed,
 * titled, labelled or exposed in any attribute here, and assigned staff appear by name and role only
 * — never with a phone or an email. Nothing here writes: no schedule, no team change, no
 * cancellation, no status change and no administrative destination.
 *
 * Freshness (30000 ms, success-only), shared ref-counted reads, same-id stale data and session
 * fencing stay in the existing root store; this page owns only its route identity, its state
 * feedback and its GET-only retry.
 *
 * Helm dependencies are declared by name, never as a spread of an imported `*Imports` constant: the
 * dev server re-applies this metadata through `ɵɵnamespaces` and resolves those entries by index,
 * which threw `Cannot read properties of undefined (reading 'HlmSpinner')` here and left the page's
 * metadata broken whenever that array and the loaded chunk disagreed.
 */
@Component({
  selector: "app-portal-service-detail-page",
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
  templateUrl: "./portal-service-detail-page.html"
})
export class PortalServiceDetailPage {
  private readonly route = inject(ActivatedRoute)
  private readonly destroyRef = inject(DestroyRef)
  private readonly orders = inject(ServiceOrdersStore)
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
    return id === null ? undefined : this.orders.selectOrder(id)
  })
  /** Authoritative absence: the backend answered 404 for this caller. */
  readonly notFound = computed(() => this.detail()?.error?.code === "NOT_FOUND")
  readonly invalid = computed(() => this.id() === null)
  readonly unavailable = computed(() => this.invalid() || this.notFound())
  readonly record = computed(() => {
    const id = this.id()
    const result = this.detail()?.result
    return this.unavailable() || result?.order.id !== id ? undefined : result
  })
  /** Only a retryable failure reaches this projection; a 404 has its own state. */
  readonly error = computed(() => {
    const error = this.detail()?.error
    return error && error.code !== "NOT_FOUND" ? error : undefined
  })
  /** The return link carries the same effective page, through the portal's paging contract. */
  readonly backContext = computed(() => portalPagingParams(portalPageContext(this.params())))
  /** Supplied fields only, printed literally: no invented total, price, duration or status. */
  readonly profile = computed<readonly DetailField[]>(() => {
    const order = this.record()?.order
    return order
      ? [
          ["Servicio (ID)", order.id],
          ["Código", order.code],
          ["Solicitud de origen (ID)", order.requestId],
          ["Tipo de servicio", order.serviceTypeName],
          ["Duración estimada (minutos)", order.estimatedDurationMinutes],
          ["Monto estimado", order.estimatedAmount],
          ["Registro (UTC)", order.createdAt.toISOString()],
          ["Última actualización (UTC)", order.updatedAt?.toISOString() ?? null]
        ]
      : []
  })
  /**
   * The property block is filtered by field, not by screen: the supplied access instructions and
   * door code are dropped here and never reach the template, an accessible name or an attribute.
   */
  readonly propertyFields = computed<readonly DetailField[]>(() => {
    const property = this.record()?.property
    return property
      ? [
          ["Alias", property.alias],
          ["Dirección", property.address],
          ["Ciudad", property.city],
          ["Región", property.region],
          ["Código postal", property.postalCode],
          ["Área (m²)", property.areaSquareMeters],
          ["Ambientes", property.roomCount],
          ["Baños", property.bathroomCount],
          ["Mascotas", property.hasPets ? "Sí" : "No"]
        ]
      : []
  })
  readonly schedule = computed(() => this.record()?.order.schedule ?? null)
  /** Name and role only: the supplied phone number never enters this projection. */
  readonly staff = computed<readonly DetailField[]>(() =>
    (this.record()?.order.assignedStaff ?? []).map(
      member => [member.name, member.role] as const satisfies DetailField
    )
  )
  readonly observation = computed(() => this.record()?.order.observation ?? null)
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "FORBIDDEN":
        return "No puedes consultar este servicio. Vuelve a Mis servicios."
      case "INVALID_RESPONSE":
        return "La respuesta del servicio no es válida. Reintenta la consulta."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
      case "UNAVAILABLE":
        return "El servicio de órdenes no está disponible en este momento."
      default:
        return "No se pudo cargar el servicio. Inténtalo de nuevo."
    }
  })

  constructor() {
    this.loads
      .pipe(
        switchMap(load =>
          load === null
            ? EMPTY
            : this.orders.observeOrder(load.id, load.force).pipe(takeUntil(this.scope.cancelled$))
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
