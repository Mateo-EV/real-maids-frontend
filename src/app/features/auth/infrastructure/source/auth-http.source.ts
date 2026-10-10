import { isPlatformBrowser } from "@angular/common"
import { HttpClient, HttpErrorResponse } from "@angular/common/http"
import { DestroyRef, inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defaultIfEmpty, defer, map, Observable, of, Subject, takeUntil } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { environment } from "@/environments/environment"
import { Result } from "@/app/shared/utils/result"
import { AuthError } from "../../domain/errors/auth.error"
import { UserSession } from "../../domain/entities/user-session.entity"
import { LoginParams } from "../../domain/params/login.params"
import { AuthMemorySession } from "../session/auth-memory-session"

const nonblank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0

@Injectable({ providedIn: "root" })
export class AuthHttpSource {
  private readonly http = inject(HttpClient)
  private readonly apiBase: unknown = inject(API_URL, { optional: true })
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private readonly memory = inject(AuthMemorySession)
  private readonly invalidate = new Subject<void>()

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.logout()
      this.invalidate.complete()
    })
  }

  login(params: LoginParams): Observable<Result<void, AuthError>> {
    const body = { correo: params.email, password: params.password }
    return defer(() => {
      this.logout()
      const endpoint = this.loginEndpoint()
      if (!this.browser || !endpoint) return of(Result.failure(new AuthError("UNCONFIGURED")))
      return this.http.post<unknown>(endpoint, body, { transferCache: false }).pipe(
        map((response): Result<void, AuthError> => {
          if (!response || typeof response !== "object" || Array.isArray(response))
            return Result.failure(new AuthError("INVALID_RESPONSE"))
          const data = response as Record<string, unknown>
          const token = data["token"]
          const type = data["tipo"]
          const email = data["correo"]
          const role = data["rol"]
          const seconds = data["expiraEnSegundos"]
          const expiresAt = typeof seconds === "number" ? Date.now() + seconds * 1000 : NaN
          if (
            !nonblank(token) ||
            typeof type !== "string" ||
            type.toLowerCase() !== "bearer" ||
            !nonblank(email) ||
            !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
            !nonblank(role) ||
            typeof seconds !== "number" ||
            !Number.isSafeInteger(seconds) ||
            seconds <= 0 ||
            !Number.isSafeInteger(expiresAt) ||
            expiresAt > 8640000000000000 ||
            expiresAt <= Date.now()
          ) {
            return Result.failure(new AuthError("INVALID_RESPONSE"))
          }
          const session = UserSession.create(null, email, role, expiresAt)
          return this.memory.establish(token, session)
            ? Result.success<void>(undefined)
            : Result.failure(new AuthError("INVALID_RESPONSE"))
        }),
        catchError((error: unknown) =>
          of(
            Result.failure(
              new AuthError(
                error instanceof HttpErrorResponse && error.status === 401
                  ? "INVALID_CREDENTIALS"
                  : error instanceof HttpErrorResponse && error.status === 0
                    ? "NETWORK"
                    : "UNEXPECTED"
              )
            )
          )
        ),
        takeUntil(this.invalidate),
        defaultIfEmpty(Result.failure(new AuthError("CANCELLED")))
      )
    })
  }

  // Local established identity only. The API does not document a /me operation.
  me(): Observable<Result<UserSession, AuthError>> {
    return defer(() => {
      const session = this.memory.current()
      return of(
        session ? Result.success(session) : Result.failure(new AuthError("INVALID_CREDENTIALS"))
      )
    })
  }

  // Clearing browser memory is not backend revocation.
  logout(): void {
    this.invalidate.next()
    this.memory.clear()
  }

  private loginEndpoint(): string | null {
    if (typeof this.apiBase !== "string" || !this.apiBase) return null
    try {
      const base = new URL(this.apiBase)
      if (base.username || base.password || base.search || base.hash || base.pathname !== "/")
        return null
      if (
        base.protocol !== "https:" &&
        !(base.protocol === "http:" && !environment.production && base.hostname === "localhost")
      )
        return null
      return `${base.origin}/api/auth/login`
    } catch {
      return null
    }
  }
}
