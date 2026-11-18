import { isPlatformBrowser } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { CustomerSupportError } from "../../domain/errors/customer-support.error"
import {
  SupportDetail,
  SupportRequestTypeView,
  SupportRequestView
} from "../../domain/models/support-views"
import { SupportRequestQuery } from "../../domain/params/customer-support.params"
import {
  failure,
  positiveId,
  requestDetail,
  requestError,
  requestPage,
  requestPagination,
  requestTypes
} from "./customer-support-http.validation"

@Injectable({ providedIn: "root" })
export class CustomerSupportHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly requestsUrl = `${this.origin}/api/atenciones`
  private readonly typesUrl = `${this.origin}/api/catalogos/tipos-atencion`

  // Cold and SSR-safe: no request is dispatched without a browser and a valid origin.
  private read<T>(send: () => Observable<T>): Observable<Result<T, CustomerSupportError>> {
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
    return this.read(() => {
      const params = requestPagination(snapshot)
      return this.http
        .get<unknown>(this.requestsUrl, { params, transferCache: false })
        .pipe(map(value => requestPage(value, params)))
    })
  }

  getRequest(id: number): Observable<Result<SupportDetail, CustomerSupportError>> {
    return this.read(() => {
      if (!positiveId(id)) throw failure("VALIDATION")
      return this.http
        .get<unknown>(`${this.requestsUrl}/${id}`, { transferCache: false })
        .pipe(map(value => requestDetail(value, id)))
    })
  }

  getRequestTypes(): Observable<Result<SupportRequestTypeView[], CustomerSupportError>> {
    return this.read(() =>
      this.http
        .get<unknown>(this.typesUrl, { transferCache: false })
        .pipe(map(value => requestTypes(value)))
    )
  }
}
