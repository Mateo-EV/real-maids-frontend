import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { ActivatedRoute, RouterLink } from "@angular/router"
import { distinctUntilChanged, EMPTY, map, startWith, Subject, switchMap } from "rxjs"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CatalogFrame } from "@/app/shared/components/catalog-frame/catalog-frame"
import {
  serviceRequestPageContext,
  serviceRequestPagingParams,
  serviceRequestRouteId
} from "../../navigation/service-request-page-context"
import { ServiceRequestsStore } from "../../state/service-requests.store"

@Component({
  imports: [
    RouterLink,
    CatalogFrame,
    HlmAlertImports,
    HlmBadgeImports,
    HlmButtonImports,
    HlmSpinnerImports
  ],
  selector: "app-service-request-detail-page",
  templateUrl: "./service-request-detail-page.html"
})
export class ServiceRequestDetailPage {
  private readonly route = inject(ActivatedRoute)
  private readonly destroyRef = inject(DestroyRef)
  private readonly requests = inject(ServiceRequestsStore)
  private readonly retries = new Subject<boolean>()
  private readonly params = signal(this.route.snapshot.queryParamMap)
  readonly id = signal<number | null>(null)
  readonly backContext = computed(() =>
    serviceRequestPagingParams(serviceRequestPageContext(this.params()))
  )
  readonly detail = computed(() => {
    const id = this.id()
    return id === null ? undefined : this.requests.selectRequest(id)
  })
  readonly request = computed(() => {
    const result = this.detail()?.result
    return result?.id === this.id() ? result : undefined
  })
  readonly profile = computed(() => {
    const request = this.request()
    return request
      ? [
          ["Solicitud (ID)", request.id],
          ["Cliente", request.customerName],
          ["Cliente (ID)", request.customerId],
          ["Propiedad", request.propertyName],
          ["Propiedad (ID)", request.propertyId],
          ["Tipo de servicio", request.serviceTypeName],
          ["Tipo de servicio (ID)", request.serviceTypeId],
          ["Fecha deseada", request.desiredDate],
          ["Registrado por", request.registeredByName],
          ["Registro (UTC)", request.registeredAt.toISOString()],
          ["Última actualización (UTC)", request.updatedAt?.toISOString() ?? null]
        ]
      : []
  })
  readonly errorMessage = computed(() => {
    switch (this.detail()?.error?.code) {
      case "NOT_FOUND":
        return "No se encontró la solicitud."
      case "FORBIDDEN":
        return "No tienes permiso para consultar esta solicitud."
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
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => this.params.set(params))
    this.route.paramMap
      .pipe(
        map(params => serviceRequestRouteId(params.get("id"))),
        distinctUntilChanged(),
        switchMap(id => {
          this.id.set(id)
          // Only route identity or explicit retry starts an observation. The root
          // store cancels session-old work without restarting it for a new session.
          return id === null
            ? EMPTY
            : this.retries.pipe(
                startWith(false),
                switchMap(force => this.requests.observeRequest(id, force))
              )
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe()
  }

  retry(): void {
    if (
      this.destroyRef.destroyed ||
      this.id() === null ||
      this.detail()?.loading ||
      this.detail()?.refreshing
    )
      return
    this.retries.next(true)
  }
}
