import { isPlatformBrowser } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { OperationsError } from "../../domain/errors/operations.error"
import { ServiceOrderDetail, ServiceOrderSummary } from "../../domain/models/operations-read.models"
import { CreateServiceOrderParams, ServiceOrderQuery } from "../../domain/params/operations.params"
import { positiveId, requestError } from "./service-requests-http.validation"
import { orderDetail, orderPage, orderPagination } from "./service-orders-http.validation"
import { createOrderBody, createdOrderDetail } from "./service-orders-create.validation"

@Injectable({ providedIn: "root" })
export class ServiceOrdersHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly url = `${this.origin}/api/ordenes`

  private read<T>(send: () => Observable<T>): Observable<Result<T, OperationsError>> {
    return defer(() => {
      if (!this.browser || !this.origin)
        return of(
          Result.failure(
            new OperationsError("UNCONFIGURED", "El servicio de órdenes no está disponible.")
          )
        )
      return defer(send).pipe(
        map(value => Result.success(value)),
        catchError((error: unknown) =>
          of(
            Result.failure(
              new OperationsError(
                requestError(error).code,
                "No se pudieron consultar las órdenes de servicio."
              )
            )
          )
        )
      )
    })
  }
  createOrder(
    params: CreateServiceOrderParams
  ): Observable<Result<ServiceOrderDetail, OperationsError>> {
    let snapshot: unknown = null
    try {
      if (params && typeof params === "object" && !Array.isArray(params))
        snapshot = {
          requestId: params.requestId,
          estimatedAmount: params.estimatedAmount,
          observation: params.observation
        }
    } catch {
      snapshot = null
    }
    return this.read(() => {
      const body = createOrderBody(snapshot)
      return this.http
        .post<unknown>(this.url, body, { transferCache: false })
        .pipe(map(value => createdOrderDetail(value, body.idSolicitud)))
    }).pipe(
      map(result =>
        result.success
          ? result
          : Result.failure(
              new OperationsError(result.error.code, "No se pudo crear la orden de servicio.")
            )
      )
    )
  }

  getOrders(
    query: ServiceOrderQuery = {}
  ): Observable<Result<PaginationResponse<ServiceOrderSummary>, OperationsError>> {
    const snapshot = { ...query }
    return this.read(() => {
      const params = orderPagination(snapshot)
      return this.http
        .get<unknown>(this.url, { params, transferCache: false })
        .pipe(map(value => orderPage(value, params)))
    })
  }
  getOrder(id: number): Observable<Result<ServiceOrderDetail, OperationsError>> {
    return this.read(() => {
      if (!positiveId(id))
        throw new OperationsError("INVALID_DATA", "Identificador de orden inválido.")
      return this.http
        .get<unknown>(`${this.url}/${id}`, { transferCache: false })
        .pipe(map(value => orderDetail(value, id)))
    })
  }
}
