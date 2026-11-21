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
  staffServiceRouteId,
  staffServicesPageContext,
  staffServicesPagingParams
} from "../staff-services-page/staff-services-paging"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import { BadgeTone } from "@/app/shared/ui/badge-tone.directive"

type DetailField = readonly [label: string, value: string | number | null]

/**
 * WP11 T3 / S4–S5 — `/staff/services/:id`, one of the field staff member's own assigned services,
 * read-only.
 *
 * The backend already scopes every order read to the caller (`ORDEN_LEER_ASIGNADA` resolves the
 * scope through the staff record of the session), so this consumer never sends a staff id, never
 * claims an assignment and never filters anything locally. An order outside that scope answers
 * `404`, not `403`: that is the adapter's typed `NOT_FOUND`, rendered as a definitive absence with
 * no retry, because repeating the same GET cannot change the answer. Every other failure keeps the
 * retryable alert and its explicit `Reintentar`.
 *
 * What the server supplied is printed literally: schedule date and clock text are verbatim, amounts
 * and observations are plain text, assigned staff appear by name and role. Nothing is recomputed,
 * no total is derived, no timezone is applied, no missing field is invented and the property's access
 * instructions and door code are not part of this page at all — they are neither projected nor
 * printed anywhere, on any audience.
 *
 * Freshness (30000 ms, success-only), shared ref-counted reads, same-id stale data and session
 * fencing stay in the existing root `ServiceOrdersStore`; this page owns only its route identity, its
 * state feedback and its GET-only retry. A route-id change replaces the read; a query-only change
 * only refreshes the return context.
 *
 * Helm dependencies are declared by name, never as a spread of an imported `*Imports` constant: the
 * dev server re-applies this metadata through `ɵɵnamespaces` and resolves those entries by index.
 */
@Component({
  selector: "app-staff-service-detail-page",
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
  templateUrl: "./staff-service-detail-page.html"
})
export class StaffServiceDetailPage {
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
  /** Only a retryable failure reaches this projection; a 404 has its own, definitive state. */
  readonly error = computed(() => {
    const error = this.detail()?.error
    return error && error.code !== "NOT_FOUND" ? error : undefined
  })
  /** The return link carries the same effective page, through the staff paging contract. */
  readonly backContext = computed(() =>
    staffServicesPagingParams(staffServicesPageContext(this.params()))
  )
  /** Supplied fields only, printed literally: no invented total, price, duration or status. */
  readonly profile = computed<readonly DetailField[]>(() => {
    const order = this.record()?.order
    return order
      ? [
          ["Servicio (ID)", order.id],
          ["Código", order.code],
          ["Cliente", order.customerName],
          ["Propiedad", order.propertyName],
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
        return "No se pudo cargar el servicio asignado. Inténtalo de nuevo."
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
        map(params => staffServiceRouteId(params)),
        distinctUntilChanged(),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(id => {
        this.id.set(id)
        if (id === null) this.loads.next(null)
        else this.load(id, false)
      })
    // Query-only changes refresh the return context and never restart a same-id read.
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
