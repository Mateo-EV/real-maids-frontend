import { isPlatformBrowser } from "@angular/common"
import { HttpClient } from "@angular/common/http"
import { inject, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { Result } from "@/app/shared/utils/result"
import { CommunicationsError } from "../../domain/errors/communications.error"
import { errorCode } from "./communications-http.validation"

/** Feature-local request safety; no repository, cache or authorization policy lives here. */
export function communicationsTransport() {
  const http = inject(HttpClient)
  const origin = apiOrigin(inject(API_URL, { optional: true }))
  const browser = isPlatformBrowser(inject(PLATFORM_ID))
  function request<T>(
    send: () => Observable<unknown>,
    parse: (v: unknown) => T
  ): Observable<Result<T, CommunicationsError>> {
    return defer(() => {
      if (!browser || !origin) return of(Result.failure(new CommunicationsError("UNCONFIGURED")))
      return defer(send).pipe(
        map(v => Result.success(parse(v))),
        catchError(error => of(Result.failure(new CommunicationsError(errorCode(error)))))
      )
    })
  }
  return { http, origin, request }
}
