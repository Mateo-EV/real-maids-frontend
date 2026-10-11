import { isPlatformBrowser } from "@angular/common"
import { HttpClient, HttpErrorResponse, HttpParams } from "@angular/common/http"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { catchError, defer, map, Observable, of } from "rxjs"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { apiOrigin } from "@/app/features/auth/infrastructure/http/auth-http-policy"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { Result } from "@/app/shared/utils/result"
import { AuditLog } from "../../domain/entities/audit-log.entity"
import { AuditLogError, AuditLogErrorCode } from "../../domain/errors/audit-log.error"
import { AuditPage } from "../../domain/models/audit-page"
import { AuditFilters, AuditQuery, validAuditFilters } from "../../domain/models/audit-query"

const invalid = (): never => {
  throw new AuditLogError("INVALID_RESPONSE")
}
const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : invalid()
const int = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value)
const int32 = (value: unknown): value is number =>
  int(value) && value >= -2147483648 && value <= 2147483647
const text = (value: unknown): string => (typeof value === "string" ? value : invalid())
// Null is preserved only when explicitly received. Missing consumed keys are invalid, never defaults.
const nullableText = (value: unknown): string | null => (value === null ? null : text(value))
const nullableId = (value: unknown): number | null =>
  value === null ? null : int32(value) ? value : invalid()
function date(value: unknown): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return invalid()
  const result = new Date(value)
  const y = Number(value.slice(0, 4)),
    m = Number(value.slice(5, 7)),
    d = Number(value.slice(8, 10))
  if (
    !Number.isFinite(result.getTime()) ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > new Date(Date.UTC(y, m, 0)).getUTCDate() ||
    Number(value.slice(11, 13)) > 23 ||
    Number(value.slice(14, 16)) > 59 ||
    Number(value.slice(17, 19)) > 59
  )
    return invalid()
  return result
}
function event(value: unknown): AuditLog {
  const p = record(value)
  if (!int(p["idLog"]) || !Array.isArray(p["cambios"])) return invalid()
  const entity = text(p["entidad"]),
    action = text(p["accion"])
  if (!entity.trim() || !action.trim()) return invalid()
  const recordId = nullableId(p["idRegistro"])
  return AuditLog.create(
    p["idLog"],
    nullableId(p["idUsuario"]),
    entity,
    action,
    nullableText(p["detalle"]),
    nullableText(p["ip"]),
    date(p["fecha"]),
    nullableText(p["nombreUsuario"]),
    recordId === null ? null : String(recordId),
    p["cambios"].map(value => {
      const c = record(value)
      return {
        field: text(c["campo"]),
        before: nullableText(c["antes"]),
        after: nullableText(c["despues"])
      }
    }),
    nullableText(p["correoUsuario"])
  )
}
function pagination(q: AuditQuery): { page: number; size: number } {
  if (
    (q.size !== undefined && !int32(q.size)) ||
    (q.limit !== undefined && !int32(q.limit)) ||
    (q.page !== undefined && !int32(q.page)) ||
    (q.offset !== undefined && !int(q.offset))
  )
    throw new AuditLogError("INVALID_PAGINATION")
  const size = q.size ?? q.limit ?? 20
  const offset = q.offset ?? 0
  const page = q.page ?? offset / size
  if (
    !int32(size) ||
    size < 1 ||
    !int(offset) ||
    offset < 0 ||
    !int32(page) ||
    page < 0 ||
    (q.page !== undefined && q.offset !== undefined && q.offset !== page * size) ||
    (q.size !== undefined && q.limit !== undefined && q.size !== q.limit)
  )
    throw new AuditLogError("INVALID_PAGINATION")
  return { page, size }
}
function filterParams(filters: AuditFilters): HttpParams {
  if (!validAuditFilters(filters)) throw new AuditLogError("INVALID_FILTER")
  let params = new HttpParams()
  const values = {
    idUsuario: filters.userId,
    entidad: filters.entity,
    accion: filters.action,
    desde: filters.dayUTC ?? filters.fromUTC,
    hasta: filters.dayUTC ?? filters.toUTC
  }
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) params = params.set(key, value)
  return params
}
function errorCode(error: unknown, exporting: boolean): AuditLogErrorCode {
  if (error instanceof AuditLogError) return error.code
  if (error instanceof AuthError) {
    if (error.code === "FORBIDDEN" || error.code === "NETWORK" || error.code === "UNCONFIGURED")
      return error.code
    return ["INVALID_CREDENTIALS", "COORDINATION", "CANCELLED"].includes(error.code)
      ? "UNAUTHENTICATED"
      : "UNEXPECTED"
  }
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 0:
        return "NETWORK"
      case 400:
        return exporting ? "EXPORT_LIMIT" : "INVALID_FILTER"
      case 401:
        return "UNAUTHENTICATED"
      case 403:
        return "FORBIDDEN"
      case 404:
        return "AUDIT_LOG_NOT_FOUND"
    }
  }
  return "UNEXPECTED"
}

@Injectable({ providedIn: "root" })
export class AuditLogHttpSource {
  private readonly http = inject(HttpClient)
  private readonly origin = apiOrigin(inject(API_URL, { optional: true }))
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  private request<T>(
    send: () => Observable<unknown>,
    parse: (value: unknown) => T,
    exporting = false
  ): Observable<Result<T, AuditLogError>> {
    return defer(() => {
      if (!this.browser || !this.origin)
        return of(Result.failure(new AuditLogError("UNCONFIGURED")))
      return defer(send).pipe(
        map(value => Result.success(parse(value))),
        catchError(error => of(Result.failure(new AuditLogError(errorCode(error, exporting)))))
      )
    })
  }
  getAuditLogs(query: AuditQuery = {}): Observable<Result<AuditPage, AuditLogError>> {
    const input = { ...query }
    return this.request(
      () => {
        const { page, size } = pagination(input)
        return this.http.get<unknown>(`${this.origin}/api/auditoria`, {
          params: filterParams(input).set("pagina", page).set("tamanio", size),
          transferCache: false
        })
      },
      value => {
        const p = record(value),
          expected = pagination(input)
        const page = p["pagina"],
          size = p["tamanio"],
          total = p["totalElementos"],
          totalPages = p["totalPaginas"],
          globalTotal = p["totalGlobal"]
        if (
          !Array.isArray(p["contenido"]) ||
          !int32(page) ||
          page < 0 ||
          !int32(size) ||
          size < 1 ||
          !int(total) ||
          total < 0 ||
          !int32(totalPages) ||
          totalPages < 0 ||
          !int(globalTotal) ||
          globalTotal < total ||
          totalPages !== Math.ceil(total / size) ||
          page !== expected.page ||
          size !== expected.size
        )
          return invalid()
        const items = p["contenido"].map(event)
        const remaining = Math.max(0, total - page * size)
        if (
          items.length > Math.min(size, remaining) ||
          new Set(items.map(log => log.id)).size !== items.length
        )
          return invalid()
        return {
          items,
          total,
          globalTotal,
          page,
          size,
          totalPages,
          offset: page * size,
          limit: size
        }
      }
    )
  }
  getAuditLogById(id: number): Observable<Result<AuditLog, AuditLogError>> {
    return this.request(
      () => {
        if (!int(id)) throw new AuditLogError("INVALID_FILTER")
        return this.http.get<unknown>(`${this.origin}/api/auditoria/${id}`, {
          transferCache: false
        })
      },
      value => {
        const log = event(value)
        return log.id === id ? log : invalid()
      }
    )
  }
  exportAuditLogs(filters: AuditFilters = {}): Observable<Result<Blob, AuditLogError>> {
    const input = { ...filters }
    return this.request(
      () =>
        this.http.get(`${this.origin}/api/auditoria/exportacion`, {
          params: filterParams(input),
          responseType: "blob",
          transferCache: false
        }),
      value => {
        if (!(value instanceof Blob)) return invalid()
        if (!value.size) throw new AuditLogError("EXPORT_EMPTY")
        return value
      },
      true
    )
  }
}
