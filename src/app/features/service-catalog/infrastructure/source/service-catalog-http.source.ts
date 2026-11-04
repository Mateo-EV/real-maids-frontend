import { isPlatformBrowser } from "@angular/common"
import { HttpClient, HttpErrorResponse } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { Result } from "@/app/shared/utils/result"
import {
  ServiceCatalogError,
  ServiceCatalogErrorCode
} from "../../domain/errors/service-catalog.error"
import { ServiceTypeSummary } from "../../domain/models/service-type-summary"

const failure = (code: ServiceCatalogErrorCode) =>
  Result.failure(new ServiceCatalogError(code, "No se pudo consultar el catálogo de servicios."))
function invalid(): never {
  throw new ServiceCatalogError("INVALID_RESPONSE", "Respuesta de catálogo inválida.")
}
function id(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 2147483647
    ? value
    : invalid()
}
function text(value: unknown): string {
  return typeof value === "string" && value.trim().length > 0 ? value : invalid()
}
function catalog(value: unknown): ServiceTypeSummary[] {
  if (!Array.isArray(value)) return invalid()
  const ids = new Set<number>()
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return invalid()
    const p = item as Record<string, unknown>
    const serviceId = id(p["idTipoServicio"])
    if (ids.has(serviceId)) return invalid()
    ids.add(serviceId)
    const duration = p["duracionEstimadaMinutos"]
    if (
      typeof duration !== "number" ||
      !Number.isInteger(duration) ||
      duration < -2147483648 ||
      duration > 2147483647
    )
      return invalid()
    const description = p["descripcion"]
    if (description !== null && typeof description !== "string") return invalid()
    return {
      id: serviceId,
      name: text(p["nombre"]),
      description,
      estimatedDurationMinutes: duration,
      categoryId: id(p["idCategoria"]),
      categoryName: text(p["categoria"])
    }
  })
}
function errorCode(error: unknown): ServiceCatalogErrorCode {
  if (error instanceof ServiceCatalogError) return error.code
  if (!(error instanceof HttpErrorResponse)) return "UNKNOWN"
  switch (error.status) {
    case 400:
      return "INVALID_DATA"
    case 401:
      return "UNAUTHENTICATED"
    case 403:
      return "FORBIDDEN"
    case 404:
      return "NOT_FOUND"
    case 405:
      return "UNSUPPORTED"
    case 409:
      return "CONFLICT"
    default:
      return "UNAVAILABLE"
  }
}

@Injectable({ providedIn: "root" })
export class ServiceCatalogHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))

  getActiveServiceTypes(): Observable<Result<ServiceTypeSummary[], ServiceCatalogError>> {
    return defer(() => {
      if (!this.browser || !this.origin) return of(failure("UNCONFIGURED"))
      return this.http
        .get<unknown>(`${this.origin}/api/catalogos/tipos-servicio`, {
          transferCache: false
        })
        .pipe(
          map(value => Result.success(catalog(value))),
          catchError((error: unknown) => of(failure(errorCode(error))))
        )
    })
  }
}
