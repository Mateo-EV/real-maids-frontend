import { HttpErrorResponse } from "@angular/common/http"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { dtoRecord } from "@/app/shared/infrastructure/http/dto-validation"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import {
  ReportsSettingsError,
  ReportsSettingsErrorCode
} from "../../domain/errors/reports-settings.error"
import { GeneratedReportSummary, ReportTable, ReportType } from "../../domain/models/report.models"
import {
  GenerateReportParams,
  ReportHistoryQuery,
  isReportCalendarDay,
  normalizeGenerateReportParams,
  normalizeReportHistoryQuery
} from "../../domain/params/reports-settings.params"

export const failure = (code: ReportsSettingsErrorCode) => new ReportsSettingsError(code)
function invalid(): never {
  throw failure("INVALID_RESPONSE")
}
function invalidInput(): never {
  throw failure("VALIDATION")
}
const record = (value: unknown) => dtoRecord(value, invalid)

export const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
// Literal text is preserved; only a blank required value is rejected.
const text = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value : invalid()
const nullableText = (value: unknown) =>
  value === null || typeof value === "string" ? value : invalid()
function list<T>(value: unknown, read: (item: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(read) : invalid()
}
// Literal `YYYY-MM-DD` days. Nothing is re-zoned or derived from "today".
const calendar = (value: unknown) => (isReportCalendarDay(value) ? value : invalid())

// `OffsetDateTime` wire strings become Date; the instant is never re-zoned here.
function instant(value: unknown): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    ) ||
    !isReportCalendarDay(value.slice(0, 10))
  )
    return invalid()
  if (!value.endsWith("Z")) {
    const [hours, minutes] = value.slice(-5).split(":").map(Number)
    if (hours > 18 || minutes > 59 || (hours === 18 && minutes !== 0)) return invalid()
  }
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : invalid()
}

/**
 * A supplied cell: strings, finite numbers, booleans and null print literally. An object,
 * an array, `undefined`, NaN or an infinite number is a malformed cell, never rendered.
 */
function cell(value: unknown): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number" && Number.isFinite(value)) return value
  return invalid()
}

/** `GET /api/reportes`: the only authoritative list of valid report types. */
export function reportTypes(value: unknown): ReportType[] {
  const seen = new Set<string>()
  return list(value, item => {
    const p = record(item)
    const type = text(p["tipo"])
    // A duplicated type would make the catalog ambiguous; it is not de-duplicated silently.
    if (seen.has(type)) return invalid()
    seen.add(type)
    return { type, title: text(p["titulo"]), description: text(p["descripcion"]) }
  })
}

/** `GET /api/reportes/generados` item. The actor arrives as display text, never as an ID. */
export function generatedReportSummary(value: unknown): GeneratedReportSummary {
  const p = record(value)
  return {
    id: positiveId(p["idReporte"]) ? p["idReporte"] : invalid(),
    type: text(p["tipo"]),
    format: text(p["formato"]),
    parameters: nullableText(p["parametros"]),
    userName: text(p["usuario"]),
    generatedAt: instant(p["fechaGeneracion"])
  }
}

/** `offset`/`limit` → `pagina`/`tamanio`, defaulting to 0/20 and refusing an unusable page. */
export function historyPagination(query: ReportHistoryQuery) {
  const normalized = normalizeReportHistoryQuery(query)
  if (!normalized) return invalidInput()
  return { pagina: normalized.offset / normalized.limit, tamanio: normalized.limit }
}

export function generatedReportPage(
  value: unknown,
  requested: { pagina: number; tamanio: number }
): PaginationResponse<GeneratedReportSummary> {
  const p = record(value)
  const page = p["pagina"],
    size = p["tamanio"],
    total = p["totalElementos"]
  if (
    !integer(page) ||
    page !== requested.pagina ||
    !positiveId(size) ||
    // The requested size is within the backend maximum, so any other effective size would
    // mean the rows do not start at the offset the caller asked for.
    size !== requested.tamanio ||
    !integer(total) ||
    !Number.isSafeInteger(page * size) ||
    !integer(p["totalPaginas"]) ||
    p["totalPaginas"] !== Math.ceil(total / size)
  )
    return invalid()
  const items = list(p["contenido"], generatedReportSummary)
  if (
    new Set(items.map(item => item.id)).size !== items.length ||
    items.length !== Math.min(size, Math.max(0, total - page * size))
  )
    return invalid()
  // The caller-adopted metadata is the server's: the page shows what the server returned.
  return { items, total, offset: page * size, limit: size }
}

function cellRow(row: unknown, width: number): unknown[] {
  if (!Array.isArray(row) || row.length !== width) return invalid()
  return row.map(cell)
}

/**
 * `GET /api/reportes/{tipo}`: a generic table in document order. The answer must be the
 * requested type — the catalog is the only authority on valid types, so an unknown type in
 * the body is a malformed response instead of a silent mismatch.
 */
export function reportTable(value: unknown, requested: GenerateReportParams): ReportTable {
  const p = record(value)
  const type = text(p["tipo"])
  if (type !== requested.type) return invalid()
  const from = calendar(p["desde"])
  const to = calendar(p["hasta"])
  if (from > to) return invalid()
  const columns = list(p["columnas"], text)
  // A table without headers cannot be rendered, and duplicated headers are ambiguous.
  if (!columns.length || new Set(columns).size !== columns.length) return invalid()
  const rows = list(p["filas"], row => cellRow(row, columns.length))
  return {
    type,
    title: text(p["titulo"]),
    from,
    to,
    generatedAt: instant(p["generadoEn"]),
    columns,
    rows
  }
}

/**
 * Non-throwing call-time capture of the documented fields only, so a mutated or
 * getter-backed input cannot be read later or throw out of the public API.
 */
export function capturedGenerate(params: GenerateReportParams): GenerateReportParams {
  try {
    if (!params || typeof params !== "object" || Array.isArray(params)) invalidInput()
    return {
      type: params.type,
      ...(params.from !== undefined ? { from: params.from } : {}),
      ...(params.to !== undefined ? { to: params.to } : {})
    }
  } catch (error) {
    if (error instanceof ReportsSettingsError) throw error
    return invalidInput()
  }
}

/** Optional `desde`/`hasta`: blank values are omitted, unusable ones are refused. */
export function generateQuery(params: GenerateReportParams): { desde?: string; hasta?: string } {
  const period = normalizeGenerateReportParams(params)
  if (!period) return invalidInput()
  return {
    ...(period.from !== undefined ? { desde: period.from } : {}),
    ...(period.to !== undefined ? { hasta: period.to } : {})
  }
}

export function reportsError(error: unknown): ReportsSettingsError {
  if (error instanceof ReportsSettingsError) return failure(error.code)
  if (error instanceof AuthError) {
    if (error.code === "FORBIDDEN") return failure("FORBIDDEN")
    if (
      [
        "INVALID_CREDENTIALS",
        "COORDINATION",
        "CANCELLED",
        "INVALID_ACCESS",
        "INVALID_REFRESH"
      ].includes(error.code)
    )
      return failure("UNAUTHENTICATED")
    return failure("NETWORK")
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status >= 200 && error.status < 300) return failure("INVALID_RESPONSE")
    const codes: Record<number, ReportsSettingsErrorCode> = {
      0: "NETWORK",
      400: "VALIDATION",
      401: "UNAUTHENTICATED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT"
    }
    return failure(codes[error.status] ?? (error.status >= 500 ? "NETWORK" : "UNEXPECTED"))
  }
  return failure("UNEXPECTED")
}
