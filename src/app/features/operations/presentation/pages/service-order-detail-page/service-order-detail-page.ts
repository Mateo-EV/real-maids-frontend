import {
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, RouterLink } from "@angular/router"
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
import { OperationsError } from "../../../domain/errors/operations.error"
import type { ScheduleSummary } from "../../../domain/models/operations-read.models"
import {
  serviceOrderPageContext,
  serviceOrderPagingParams,
  serviceOrderRouteId
} from "../../navigation/service-order-page-context"
import { ServiceOrdersStore } from "../../state/service-orders.store"

type DetailField = readonly [label: string, value: string | number | null]

@Component({
  selector: "app-service-order-detail-page",
  imports: [
    RouterLink,
    CatalogFrame,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmEmptyImports,
    HlmSpinnerImports
  ],
  templateUrl: "./service-order-detail-page.html"
})
export class ServiceOrderDetailPage {
  private readonly route = inject(ActivatedRoute)
  private readonly destroyRef = inject(DestroyRef)
  private readonly orders = inject(ServiceOrdersStore)
  private readonly retries = new Subject<boolean>()
  private readonly ownerChanged = new Subject<void>()
  private readonly params = signal(this.route.snapshot.queryParamMap)
  private readonly observationError = signal<OperationsError | undefined>(undefined)
  private readonly accessElement = viewChild<ElementRef<HTMLDetailsElement>>("propertyAccess")
  private ownerGeneration = -1
  readonly id = signal<number | null>(null)
  readonly ownerRevision = signal(0)
  readonly ownerActive = signal(false)
  readonly accessVisible = signal(false)
  private readonly scope = createSessionReadScope(() => this.stopOwner())

  readonly backContext = computed(() =>
    serviceOrderPagingParams(serviceOrderPageContext(this.params()))
  )
  // Key DOM lifetimes by route/session ownership, not by return parameters or
  // refreshed result objects. No local writable copy of order data is retained.
  readonly views = computed(() => [{ id: this.id(), revision: this.ownerRevision() }])
  readonly detail = computed(() => {
    const id = this.id()
    return id === null || !this.ownerActive() ? undefined : this.orders.selectOrder(id)
  })
  readonly selected = computed(() => {
    const result = this.detail()?.result
    return result?.order.id === this.id() ? result : undefined
  })
  readonly error = computed(() => this.detail()?.error ?? this.observationError())
  readonly errorMessage = computed(() => {
    switch (this.error()?.code) {
      case "NOT_FOUND":
        return "No se encontró la orden."
      case "FORBIDDEN":
        return "No tienes permiso para consultar esta orden."
      case "INVALID_RESPONSE":
        return "La respuesta del servicio no es válida. Reintenta la consulta."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNCONFIGURED":
      case "UNAVAILABLE":
        return "El servicio de órdenes no está disponible en este momento."
      default:
        return "No se pudo cargar la orden. Inténtalo de nuevo."
    }
  })
  readonly orderFields = computed<readonly DetailField[]>(() => {
    const order = this.selected()?.order
    return order
      ? [
          ["Orden (ID)", order.id],
          ["Código", order.code],
          ["Estado (código)", order.status],
          ["Solicitud de origen (ID)", order.requestId],
          ["Cliente", order.customerName],
          ["Cliente (ID)", order.customerId],
          ["Propiedad", order.propertyName],
          ["Propiedad (ID)", order.propertyId],
          ["Tipo de servicio", order.serviceTypeName],
          ["Tipo de servicio (ID)", order.serviceTypeId],
          ["Duración estimada (minutos)", order.estimatedDurationMinutes],
          ["Monto estimado", order.estimatedAmount],
          ["Creación (UTC)", order.createdAt.toISOString()],
          ["Última actualización (UTC)", order.updatedAt?.toISOString() ?? null]
        ]
      : []
  })
  readonly propertyFields = computed<readonly DetailField[]>(() => {
    const property = this.selected()?.property
    // Access fields are intentionally absent from every summary projection.
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
          ["Mascotas", property.hasPets ? "Sí" : "No"],
          ["Propiedad activa", property.isActive ? "Activa" : "Inactiva"],
          ["Creación de propiedad (UTC)", property.createdAt.toISOString()]
        ]
      : []
  })

  constructor() {
    this.destroyRef.onDestroy(() => {
      this.stopOwner()
      this.ownerChanged.complete()
      this.retries.complete()
    })
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.params.set(params))
    this.route.paramMap
      .pipe(
        map(params => serviceOrderRouteId(params)),
        distinctUntilChanged(),
        switchMap(id => {
          // switchMap releases the previous observation before replacement data
          // can be selected. Session cancellation never automatically rereads.
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
              return this.orders.observeOrder(id, force).pipe(
                tap(result => {
                  if (!this.current(id, revision)) return
                  // Admission failures have no admitted root entry. Keep only
                  // their safe observation error locally, never a result cache.
                  this.observationError.set(
                    !result.success && !this.orders.selectOrder(id).error ? result.error : undefined
                  )
                }),
                catchError(() => {
                  if (this.current(id, revision))
                    this.observationError.set(
                      new OperationsError("UNKNOWN", "No se pudo consultar la orden.")
                    )
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

  scheduleFields(schedule: ScheduleSummary): readonly DetailField[] {
    return [
      ["ID de programación", schedule.id],
      ["Fecha", schedule.date],
      ["Hora de inicio", schedule.startTime],
      ["Hora de fin", schedule.endTime],
      ["Vigente", schedule.isCurrent ? "Sí" : "No"],
      ["Motivo", schedule.reasonName],
      ["Registrado por", schedule.registeredByName],
      ["Registro (UTC)", schedule.registeredAt.toISOString()]
    ]
  }

  toggleAccess(element: HTMLDetailsElement, id: number | null, revision: number): void {
    if (
      !this.current(id, revision) ||
      this.accessElement()?.nativeElement !== element ||
      !this.selected()
    )
      return
    this.accessVisible.set(element.open)
  }

  retry(id: number | null, revision: number): void {
    if (!this.current(id, revision)) return
    // Native close can precede its queued toggle. Never let a retry preserve or
    // remount secret DOM merely because the previous open signal was still true.
    if (!this.accessElement()?.nativeElement.open) this.accessVisible.set(false)
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
      this.ownerGeneration === this.scope.generation() &&
      this.ownerActive()
    )
  }

  private stopOwner(): void {
    this.ownerActive.set(false)
    this.ownerGeneration = -1
    this.accessVisible.set(false)
    if (!this.destroyRef.destroyed) {
      const element = this.accessElement()?.nativeElement
      if (element) element.open = false
    }
    this.observationError.set(undefined)
    this.ownerRevision.update(revision => revision + 1)
    this.ownerChanged.next()
  }
}
