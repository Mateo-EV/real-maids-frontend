import { PRESERVE_API_CONFLICT } from "@/app/core/http/api-conflict-context"
import { HttpErrorResponse, HttpInterceptorFn } from "@angular/common/http"
import { inject } from "@angular/core"
import { catchError, switchMap, throwError } from "rxjs"
import { AuthHttpSource } from "../source/auth-http.source"
import { AuthPersistentSession } from "../session/auth-persistent-session"
import { AUTH_INTERNAL, protectedApiUrl } from "../http/auth-http-policy"
import { AuthError } from "../../domain/errors/auth.error"

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const storage = inject(AuthPersistentSession)
  if (
    request.context.get(AUTH_INTERNAL) ||
    !storage.browser ||
    !protectedApiUrl(request.url, storage.origin)
  )
    return next(request)
  const source = inject(AuthHttpSource)
  return source.accessToken().pipe(
    switchMap(token =>
      next(
        request.clone({
          setHeaders: { Authorization: `Bearer ${token}` },
          transferCache: false
        })
      ).pipe(
        catchError((error: unknown) => {
          // No replay, including writes. A stale 401 cannot clear newer credentials.
          if (error instanceof HttpErrorResponse && error.status === 401) source.invalidate(token)
          if (
            error instanceof HttpErrorResponse &&
            error.status === 409 &&
            request.context.get(PRESERVE_API_CONFLICT)
          )
            return throwError(() => error)
          return throwError(
            () =>
              new AuthError(
                error instanceof HttpErrorResponse && error.status === 401
                  ? "INVALID_CREDENTIALS"
                  : error instanceof HttpErrorResponse && error.status === 403
                    ? "FORBIDDEN"
                    : error instanceof HttpErrorResponse && error.status === 0
                      ? "NETWORK"
                      : "UNEXPECTED"
              )
          )
        })
      )
    )
  )
}
