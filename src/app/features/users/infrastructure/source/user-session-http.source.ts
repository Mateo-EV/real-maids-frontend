import { isPlatformBrowser } from "@angular/common"
import { HttpClient, HttpErrorResponse, HttpParams } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { Result } from "@/app/shared/utils/result"
import { UserSession } from "../../domain/entities/user-session.entity"
import { UserSessionError, UserSessionErrorCode } from "../../domain/errors/user-session.error"

const id = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= -2147483648 && v <= 2147483647
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0
function invalid(): never {
  throw new UserSessionError("INVALID_RESPONSE")
}
function record(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) invalid()
  return v as Record<string, unknown>
}
function date(v: unknown): Date {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)
  )
    invalid()
  const d = new Date(v)
  const year = Number(v.slice(0, 4)),
    month = Number(v.slice(5, 7)),
    day = Number(v.slice(8, 10))
  if (
    !Number.isFinite(d.getTime()) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    Number(v.slice(11, 13)) > 23 ||
    Number(v.slice(14, 16)) > 59 ||
    Number(v.slice(17, 19)) > 59
  )
    invalid()
  return d
}
function session(v: unknown): UserSession {
  const p = record(v)
  if (
    !id(p["idSesion"]) ||
    !id(p["idUsuario"]) ||
    !text(p["nombreUsuario"]) ||
    !text(p["correoUsuario"]) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p["correoUsuario"]) ||
    !text(p["ip"]) ||
    !text(p["dispositivo"]) ||
    typeof p["actual"] !== "boolean"
  )
    invalid()
  const start = date(p["fechaInicio"]),
    expiry = date(p["fechaExpiracion"])
  if (expiry <= start) invalid()
  return UserSession.create(
    p["idSesion"],
    p["idUsuario"],
    p["ip"],
    p["dispositivo"],
    start,
    expiry,
    p["actual"],
    p["nombreUsuario"],
    p["correoUsuario"]
  )
}
function sessions(v: unknown, userId?: number): UserSession[] {
  if (!Array.isArray(v)) invalid()
  const items = v.map(session)
  if (
    new Set(items.map(s => s.id)).size !== items.length ||
    items.filter(s => s.isCurrent).length > 1 ||
    (userId !== undefined && items.some(s => s.userId !== userId))
  )
    invalid()
  const owners = new Map<number, UserSession>()
  for (const s of items) {
    const previous = owners.get(s.userId)
    if (previous && (previous.userName !== s.userName || previous.userEmail !== s.userEmail))
      invalid()
    owners.set(s.userId, s)
  }
  return items
}
function code(error: unknown): UserSessionErrorCode {
  if (error instanceof UserSessionError) return error.code
  if (error instanceof AuthError)
    return error.code === "FORBIDDEN"
      ? "FORBIDDEN"
      : error.code === "NETWORK"
        ? "NETWORK"
        : error.code === "UNCONFIGURED"
          ? "UNCONFIGURED"
          : "UNAUTHENTICATED"
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 0:
        return "NETWORK"
      case 400:
        return "VALIDATION"
      case 401:
        return "UNAUTHENTICATED"
      case 403:
        return "FORBIDDEN"
      case 404:
        return "SESSION_NOT_FOUND"
    }
  }
  return "UNEXPECTED"
}

@Injectable({ providedIn: "root" })
export class UserSessionHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private request<T>(
    send: () => Observable<unknown>,
    parse: (v: unknown) => T
  ): Observable<Result<T, UserSessionError>> {
    return defer(() => {
      if (!this.browser || !this.origin)
        return of(Result.failure(new UserSessionError("UNCONFIGURED")))
      return defer(send).pipe(
        map(v => Result.success(parse(v))),
        catchError(e => of(Result.failure(new UserSessionError(code(e)))))
      )
    })
  }
  getUserSessions(): Observable<Result<UserSession[], UserSessionError>> {
    const page = 0,
      size = 1000
    return this.request(
      () =>
        this.http.get<unknown>(`${this.origin}/api/sesiones`, {
          params: new HttpParams().set("pagina", page).set("tamanio", size),
          transferCache: false
        }),
      v => {
        const p = record(v),
          effectiveSize = p["tamanio"],
          total = p["totalElementos"],
          pages = p["totalPaginas"]
        if (
          p["pagina"] !== page ||
          typeof effectiveSize !== "number" ||
          !Number.isSafeInteger(effectiveSize) ||
          effectiveSize <= 0 ||
          effectiveSize > size ||
          typeof total !== "number" ||
          !Number.isSafeInteger(total) ||
          total < 0 ||
          !id(pages) ||
          pages < 0 ||
          pages !== Math.ceil(total / effectiveSize)
        )
          invalid()
        const items = sessions(p["contenido"])
        const expected = Math.min(effectiveSize, Math.max(0, total - page * effectiveSize))
        if (
          items.length !== expected ||
          items.some((s, i) => i > 0 && s.startDate > items[i - 1].startDate)
        )
          invalid()
        return items
      }
    )
  }
  getUserSessionsByUser(userId: number): Observable<Result<UserSession[], UserSessionError>> {
    return this.request(
      () => {
        if (!id(userId)) throw new UserSessionError("INVALID_QUERY")
        return this.http.get<unknown>(`${this.origin}/api/usuarios/${userId}/sesiones`, {
          transferCache: false
        })
      },
      v => sessions(v, userId)
    )
  }
  revokeUserSession(userId: number, sessionId: number): Observable<Result<void, UserSessionError>> {
    return this.remove(userId, sessionId)
  }
  revokeUserSessions(userId: number): Observable<Result<void, UserSessionError>> {
    return this.remove(userId)
  }
  private remove(userId: number, sessionId?: number): Observable<Result<void, UserSessionError>> {
    return this.request(
      () => {
        if (!id(userId) || (sessionId !== undefined && !id(sessionId)))
          throw new UserSessionError("INVALID_QUERY")
        return this.http.delete(
          `${this.origin}/api/usuarios/${userId}/sesiones${sessionId === undefined ? "" : `/${sessionId}`}`,
          { responseType: "text", transferCache: false }
        )
      },
      () => undefined
    )
  }
}
