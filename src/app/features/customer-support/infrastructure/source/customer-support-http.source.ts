import { isPlatformBrowser } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiConflictContext } from "@/app/core/http/api-conflict-context"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { CustomerSupportError } from "../../domain/errors/customer-support.error"
import {
  SupportDetail,
  SupportRequestTypeView,
  SupportRequestView
} from "../../domain/models/support-views"
import {
  AddSupportMessageParams,
  ChangeSupportStateParams,
  CreateSupportRequestParams,
  SupportRequestQuery
} from "../../domain/params/customer-support.params"
import {
  failure,
  positiveId,
  requestDetail,
  requestError,
  requestPage,
  requestPagination,
  requestTypes
} from "./customer-support-http.validation"
import {
  captureAddMessage,
  captureChangeState,
  captureCreateRequest,
  changeStateRequestBody,
  createSupportRequestBody,
  followUpRequestBody
} from "./customer-support-write.validation"

@Injectable({ providedIn: "root" })
export class CustomerSupportHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly requestsUrl = `${this.origin}/api/atenciones`
  private readonly typesUrl = `${this.origin}/api/catalogos/tipos-atencion`

  // Cold and SSR-safe: no request or write is dispatched without a browser and a valid origin.
  private dispatch<T>(send: () => Observable<T>): Observable<Result<T, CustomerSupportError>> {
    return defer(() => {
      if (!this.browser || !this.origin) return of(Result.failure(failure("UNAVAILABLE")))
      return defer(send).pipe(
        map(value => Result.success(value)),
        catchError((error: unknown) => of(Result.failure(requestError(error))))
      )
    })
  }

  getRequests(
    query: SupportRequestQuery = {}
  ): Observable<Result<PaginationResponse<SupportRequestView>, CustomerSupportError>> {
    const snapshot = { ...query }
    return this.dispatch(() => {
      const params = requestPagination(snapshot)
      return this.http
        .get<unknown>(this.requestsUrl, { params, transferCache: false })
        .pipe(map(value => requestPage(value, params)))
    })
  }

  getRequest(id: number): Observable<Result<SupportDetail, CustomerSupportError>> {
    return this.dispatch(() => {
      if (!positiveId(id)) throw failure("VALIDATION")
      return this.http
        .get<unknown>(`${this.requestsUrl}/${id}`, {
          transferCache: false,
          context: apiConflictContext()
        })
        .pipe(map(value => requestDetail(value, id)))
    })
  }

  getRequestTypes(): Observable<Result<SupportRequestTypeView[], CustomerSupportError>> {
    return this.dispatch(() =>
      this.http
        .get<unknown>(this.typesUrl, { transferCache: false })
        .pipe(map(value => requestTypes(value)))
    )
  }

  createRequest(
    params: CreateSupportRequestParams
  ): Observable<Result<SupportDetail, CustomerSupportError>> {
    const snapshot = captureCreateRequest(params)
    return this.dispatch(() => {
      const body = createSupportRequestBody(snapshot)
      return this.http.post<unknown>(this.requestsUrl, body, { transferCache: false }).pipe(
        map(value => {
          const detail = requestDetail(value)
          // The answer is the read DTO; the registered identity must be the requested one.
          if (
            detail.request.requestTypeId !== body.idTipo ||
            (body.idCliente !== null && detail.request.customerId !== body.idCliente) ||
            (body.idOrden !== undefined && detail.request.orderId !== body.idOrden)
          )
            throw failure("INVALID_RESPONSE")
          return detail
        })
      )
    })
  }

  addMessage(
    requestId: number,
    params: AddSupportMessageParams
  ): Observable<Result<SupportDetail, CustomerSupportError>> {
    const snapshot = captureAddMessage(params)
    return this.dispatch(() => {
      if (!positiveId(requestId)) throw failure("VALIDATION")
      const body = followUpRequestBody(snapshot)
      return this.http
        .post<unknown>(`${this.requestsUrl}/${requestId}/seguimiento`, body, {
          transferCache: false
        })
        .pipe(map(value => requestDetail(value, requestId)))
    })
  }

  changeState(
    requestId: number,
    params: ChangeSupportStateParams
  ): Observable<Result<SupportDetail, CustomerSupportError>> {
    const snapshot = captureChangeState(params)
    return this.dispatch(() => {
      if (!positiveId(requestId)) throw failure("VALIDATION")
      const body = changeStateRequestBody(snapshot)
      return this.http
        .patch<unknown>(`${this.requestsUrl}/${requestId}/estado`, body, { transferCache: false })
        .pipe(map(value => requestDetail(value, requestId)))
    })
  }
}
