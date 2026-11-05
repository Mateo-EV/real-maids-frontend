import { isPlatformBrowser } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { OperationsError } from "../../domain/errors/operations.error"
import { ServiceRequestSummary } from "../../domain/models/operations-read.models"
import {
  CreateServiceRequestParams,
  ServiceRequestQuery
} from "../../domain/params/operations.params"
import { createRequestBody } from "./service-requests-create.validation"
import {
  failure,
  positiveId,
  requestDto,
  requestError,
  requestPage,
  requestPagination
} from "./service-requests-http.validation"

@Injectable({ providedIn: "root" })
export class ServiceRequestsHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly url = `${this.origin}/api/solicitudes`

  private request<T>(send: () => Observable<T>): Observable<Result<T, OperationsError>> {
    return defer(() => {
      if (!this.browser || !this.origin) return of(Result.failure(failure("UNCONFIGURED")))
      return defer(send).pipe(
        map(value => Result.success(value)),
        catchError((error: unknown) => of(Result.failure(requestError(error))))
      )
    })
  }

  createRequest(
    params: CreateServiceRequestParams
  ): Observable<Result<ServiceRequestSummary, OperationsError>> {
    const snapshot = { ...params }
    return this.request(() => {
      const body = createRequestBody(snapshot)
      return this.http.post<unknown>(this.url, body, { transferCache: false }).pipe(
        map(value => {
          const result = requestDto(value)
          if (
            result.customerId !== body.idCliente ||
            result.propertyId !== body.idPropiedad ||
            result.serviceTypeId !== body.idTipoServicio
          )
            throw failure("INVALID_RESPONSE")
          return result
        })
      )
    }).pipe(
      map(result =>
        result.success
          ? result
          : Result.failure(
              new OperationsError(result.error.code, "No se pudo crear la solicitud de servicio.")
            )
      )
    )
  }

  getRequests(
    query: ServiceRequestQuery = {}
  ): Observable<Result<PaginationResponse<ServiceRequestSummary>, OperationsError>> {
    const snapshot = { ...query }
    return this.request(() => {
      const params = requestPagination(snapshot)
      return this.http
        .get<unknown>(this.url, { params, transferCache: false })
        .pipe(map(value => requestPage(value, params)))
    })
  }

  getRequest(id: number): Observable<Result<ServiceRequestSummary, OperationsError>> {
    return this.request(() => {
      if (!positiveId(id)) throw failure("INVALID_DATA")
      return this.http
        .get<unknown>(`${this.url}/${id}`, { transferCache: false })
        .pipe(map(value => requestDto(value, id)))
    })
  }
}
