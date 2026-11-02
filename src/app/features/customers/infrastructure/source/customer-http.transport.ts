import { isPlatformBrowser } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { inject, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { Result } from "@/app/shared/utils/result"
import { CustomerError, CustomerErrorCode } from "../../domain/errors/customer.error"
import { errorCode } from "./customer-http.validation"

/** Feature-local request safety shared by customer transports; no repository or CRUD policy. */
export function customerTransport() {
  const http = inject(HttpClient)
  const origin = apiOrigin(inject(API_URL, { optional: true }))
  const browser = isPlatformBrowser(inject(PLATFORM_ID))
  function request<T>(
    send: () => Observable<unknown>,
    parse: (v: unknown) => T,
    notFound: CustomerErrorCode = "NOT_FOUND"
  ): Observable<Result<T, CustomerError>> {
    return defer(() => {
      if (!browser || !origin) return of(Result.failure(new CustomerError("UNCONFIGURED")))
      return defer(send).pipe(
        map(v => Result.success(parse(v))),
        catchError(error => of(Result.failure(new CustomerError(errorCode(error, notFound)))))
      )
    })
  }
  return { http, origin, request }
}
