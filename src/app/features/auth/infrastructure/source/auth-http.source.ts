import { HttpClient, HttpErrorResponse, HttpHeaders } from "@angular/common/http"
import { DestroyRef, inject, Injectable } from "@angular/core"
import {
  catchError,
  defaultIfEmpty,
  defer,
  finalize,
  firstValueFrom,
  map,
  Observable,
  of,
  shareReplay,
  Subject,
  switchMap,
  takeUntil,
  timeout
} from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { AuthError } from "../../domain/errors/auth.error"
import { AuthSession } from "../../domain/entities/auth-session.entity"
import { LoginParams } from "../../domain/params/login.params"
import { AuthPersistentSession } from "../session/auth-persistent-session"
import { authContext } from "../http/auth-http-policy"
import { loginResponse, profile } from "../http/auth-response"

@Injectable({ providedIn: "root" })
export class AuthHttpSource {
  private readonly http = inject(HttpClient)
  private readonly storage = inject(AuthPersistentSession)
  private readonly invalidated = new Subject<void>()
  private readonly changes = new Subject<AuthSession | null>()
  private loaded: AuthSession | null = null
  private loadedRaw: string | null = null
  private revision = 0
  private refreshFlight: Observable<string> | null = null
  private readonly destroyed = new Subject<void>()

  constructor() {
    const subscription = this.storage.changes.subscribe(() => {
      if (this.loaded && this.loadedRaw === this.storage.raw() && this.storage.read()) return
      this.invalidateLocal()
      // Shared credentials are never a trusted profile. Revalidate external renewal/login.
      if (this.storage.read()) this.me().pipe(takeUntil(this.destroyed)).subscribe()
    })
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe()
      this.invalidateLocal()
      this.destroyed.next()
      this.destroyed.complete()
      this.invalidated.complete()
      this.changes.complete()
    })
  }

  sessionChanges(): Observable<AuthSession | null> {
    return this.changes.asObservable()
  }

  private invalidateLocal(): void {
    this.revision++
    this.loaded = null
    this.loadedRaw = null
    this.invalidated.next()
    this.changes.next(null)
  }

  private publish(session: AuthSession, token: string): void {
    const raw = this.storage.raw()
    const snapshot = raw ? (JSON.parse(raw) as { credentials?: { token?: unknown } }) : null
    if (snapshot?.credentials?.token !== token) throw new AuthError("CANCELLED")
    this.loaded = session
    this.loadedRaw = raw
    this.changes.next(session)
  }

  invalidate(token?: string): void {
    if (token !== undefined && this.storage.read()?.token !== token) return
    this.storage.clear()
  }

  private failure(error: unknown): AuthError {
    if (error instanceof AuthError) return error
    if (error instanceof HttpErrorResponse) {
      if (error.status === 401) return new AuthError("INVALID_CREDENTIALS")
      if (error.status === 403) return new AuthError("FORBIDDEN")
      if (error.status === 0) return new AuthError("NETWORK")
    }
    return new AuthError("UNEXPECTED")
  }

  login(params: LoginParams): Observable<Result<void, AuthError>> {
    const body = { correo: params.email, password: params.password }
    return defer(() => {
      // Starting/replacing login is local invalidation, not remote logout.
      this.invalidateLocal()
      if (!this.storage.browser || !this.storage.origin)
        return of(Result.failure(new AuthError("UNCONFIGURED")))
      this.storage.clear()
      const expected = this.storage.raw()
      const revision = this.revision
      let established = false
      return this.http
        .post<unknown>(`${this.storage.origin}/api/auth/login`, body, {
          context: authContext(),
          transferCache: false
        })
        .pipe(
          timeout(10000),
          map(response => {
            const parsed = loginResponse(response)
            if (revision !== this.revision || this.storage.raw() !== expected)
              throw new AuthError("CANCELLED")
            if (!this.storage.write(parsed.credentials, expected)) throw new AuthError("STORAGE")
            this.publish(parsed.session, parsed.credentials.token)
            established = true
            return Result.success<void>(undefined)
          }),
          catchError(error => of(Result.failure(this.failure(error)))),
          takeUntil(this.invalidated),
          defaultIfEmpty(Result.failure(new AuthError("CANCELLED"))),
          finalize(() => {
            if (!established && revision === this.revision) this.invalidateLocal()
          })
        )
    })
  }

  me(): Observable<Result<AuthSession, AuthError>> {
    return defer(() => {
      const credentials = this.storage.read()
      if (!credentials) {
        if (this.loaded) this.invalidateLocal()
        return of(Result.failure(new AuthError("INVALID_CREDENTIALS")))
      }
      if (
        this.loaded &&
        this.loadedRaw === this.storage.raw() &&
        credentials.accessExpiresAt > Date.now()
      )
        return of(Result.success(this.loaded))
      const revision = this.revision
      return this.accessToken().pipe(
        switchMap(token => {
          const expected = this.storage.raw()
          return this.http
            .get<unknown>(`${this.storage.origin}/api/auth/me`, {
              context: authContext(),
              headers: new HttpHeaders({ Authorization: `Bearer ${token}` }),
              transferCache: false
            })
            .pipe(
              timeout(10000),
              map(response => {
                if (revision !== this.revision || expected !== this.storage.raw())
                  throw new AuthError("CANCELLED")
                const current = this.storage.read()
                if (!current) throw new AuthError("INVALID_CREDENTIALS")
                const session = profile(response, current.sessionExpiresAt)
                this.publish(session, token)
                return Result.success(session)
              })
            )
        }),
        takeUntil(this.invalidated),
        defaultIfEmpty(Result.failure(new AuthError("CANCELLED"))),
        catchError(error => {
          if (revision === this.revision) this.storage.clear()
          return of(Result.failure(this.failure(error)))
        })
      )
    })
  }

  accessToken(): Observable<string> {
    return defer(() => {
      const credentials = this.storage.read()
      if (!credentials) throw new AuthError("INVALID_CREDENTIALS")
      if (credentials.accessExpiresAt > Date.now()) return of(credentials.token)
      if (!this.refreshFlight) {
        const flight = this.refresh().pipe(
          finalize(() => {
            if (this.refreshFlight === flight) this.refreshFlight = null
          }),
          shareReplay({ bufferSize: 1, refCount: true })
        )
        this.refreshFlight = flight
      }
      return this.refreshFlight
    })
  }

  private refresh(): Observable<string> {
    return new Observable<string>(subscriber => {
      const locks = this.storage.locks
      if (!locks) {
        this.invalidate()
        subscriber.error(new AuthError("COORDINATION"))
        return
      }
      const revision = this.revision
      const abort = new AbortController()
      const cancel = new Subject<void>()
      let sent = false
      let committed = false
      let expected: string | null = null
      const invalidation = this.invalidated.subscribe(() => {
        abort.abort()
        cancel.next()
      })
      locks
        .request(
          `real-maids.auth.refresh:${this.storage.origin}`,
          { signal: abort.signal },
          async () => {
            if (subscriber.closed || revision !== this.revision) throw new AuthError("CANCELLED")
            // Another tab may have rotated while we waited for the exclusive lock.
            const credentials = this.storage.read()
            if (!credentials) throw new AuthError("INVALID_CREDENTIALS")
            if (credentials.accessExpiresAt > Date.now()) return credentials.token
            expected = this.storage.raw()
            sent = true
            try {
              const response = await firstValueFrom(
                this.http
                  .post<unknown>(
                    `${this.storage.origin}/api/auth/refresh`,
                    { refreshToken: credentials.refreshToken },
                    { context: authContext(), transferCache: false }
                  )
                  .pipe(timeout(10000), takeUntil(cancel))
              )
              if (
                subscriber.closed ||
                revision !== this.revision ||
                this.storage.raw() !== expected
              )
                throw new AuthError("CANCELLED")
              const parsed = loginResponse(response, credentials.sessionExpiresAt)
              if (parsed.credentials.refreshToken === credentials.refreshToken)
                throw new AuthError("INVALID_REFRESH")
              if (!this.storage.write(parsed.credentials, expected)) throw new AuthError("STORAGE")
              committed = true
              this.publish(parsed.session, parsed.credentials.token)
              return parsed.credentials.token
            } catch (error) {
              // Ambiguous transport/cancellation must never reuse the one-time token.
              if (this.storage.raw() === expected) this.storage.clear(expected)
              throw this.failure(error)
            }
          }
        )
        .then(
          token => {
            subscriber.next(token)
            subscriber.complete()
          },
          error => subscriber.error(this.failure(error))
        )
      return () => {
        invalidation.unsubscribe()
        abort.abort()
        cancel.next()
        cancel.complete()
        if (sent && !committed && this.storage.raw() === expected) this.storage.clear(expected)
      }
    })
  }

  logout(): void {
    const credentials = this.storage.read()
    this.invalidateLocal()
    this.storage.clear()
    if (!credentials || !this.storage.browser || !this.storage.origin) return
    // Snapshot only; no interceptor refresh, recursion, retry, or claimed remote success.
    this.http
      .post(
        `${this.storage.origin}/api/auth/logout`,
        { refreshToken: credentials.refreshToken },
        {
          headers: new HttpHeaders({ Authorization: `Bearer ${credentials.token}` }),
          context: authContext(),
          transferCache: false,
          responseType: "text"
        }
      )
      .pipe(
        timeout(10000),
        takeUntil(this.destroyed),
        catchError(() => of(null))
      )
      .subscribe()
  }
}
