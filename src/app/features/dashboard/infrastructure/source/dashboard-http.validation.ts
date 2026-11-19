import { HttpErrorResponse } from "@angular/common/http"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { dtoRecord, dtoText } from "@/app/shared/infrastructure/http/dto-validation"
import { DashboardError, DashboardErrorCode } from "../../domain/errors/dashboard.error"
import {
  CollaboratorLoad,
  CurrentSituation,
  DailyServiceCount,
  DashboardView,
  ORDER_STATE_CODES,
  OrderStateCode,
  PeriodActivity
} from "../../domain/models/dashboard-views"
import {
  DashboardParams,
  isCalendarDay,
  normalizeDashboardParams
} from "../../domain/params/dashboard.params"

export const failure = (code: DashboardErrorCode) => new DashboardError(code)
function invalid(): never {
  throw failure("INVALID_RESPONSE")
}
function invalidInput(): never {
  throw failure("VALIDATION")
}
const record = (value: unknown) => dtoRecord(value, invalid)
// Literal text is preserved; only a blank required value is rejected.
const text = (value: unknown) => (dtoText(value) ? value : invalid())
const orderStates = new Set<string>(ORDER_STATE_CODES)

// Literal `YYYY-MM-DD` days. Nothing is re-zoned or derived from "today".
const day = (value: unknown) => (isCalendarDay(value) ? value : invalid())
// Counts are non-negative safe integers; a fractional or negative count is not coerced.
const count = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : invalid()
// `OffsetDateTime` wire strings become Date; the instant is never re-zoned here.
function instant(value: unknown): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    ) ||
    !isCalendarDay(value.slice(0, 10))
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
 * A `BigDecimal` arrives as a JSON number and its supplied value is preserved as
 * text: no rounding, no fixed scale and no arithmetic. Only a non-negative,
 * finite, plain-notation number can be printed literally, so exponential output
 * (an out-of-range magnitude) is an invalid response instead of a rewritten value.
 */
function decimal(value: unknown): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return invalid()
  const canonical = String(value)
  return /^\d+(?:\.\d+)?$/.test(canonical) ? canonical : invalid()
}
function list<T>(value: unknown, read: (item: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(read) : invalid()
}
function unique<T>(items: T[], key: (item: T) => string | number): T[] {
  return new Set(items.map(key)).size === items.length ? items : invalid()
}

/** `Map<CodigoEstadoOrden, Long>`: only reported codes are kept, in received order. */
function stateCounts(value: unknown): Readonly<Partial<Record<OrderStateCode, number>>> {
  const entries = record(value)
  const counts: Partial<Record<OrderStateCode, number>> = {}
  for (const [code, total] of Object.entries(entries)) {
    if (!orderStates.has(code)) return invalid()
    counts[code as OrderStateCode] = count(total)
  }
  return counts
}
function dailySeries(value: unknown): DailyServiceCount[] {
  return unique(
    list(value, item => {
      const point = record(item)
      return { date: day(point["fecha"]), services: count(point["servicios"]) }
    }),
    point => point.date
  )
}
function collaboratorLoad(value: unknown): CollaboratorLoad[] {
  return unique(
    list(value, item => {
      const load = record(item)
      const staffId = load["idPersonal"]
      if (
        typeof staffId !== "number" ||
        !Number.isSafeInteger(staffId) ||
        staffId <= 0 ||
        staffId > 2147483647
      )
        return invalid()
      return {
        staffId,
        name: text(load["nombre"]),
        services: count(load["servicios"]),
        hours: decimal(load["horas"])
      }
    }),
    load => load.staffId
  )
}

/**
 * Non-throwing call-time capture of the documented fields only, so a mutated or
 * getter-backed input cannot be read later or throw out of the public API.
 */
export function capturedParams(params: DashboardParams = {}): DashboardParams | null {
  try {
    if (!params || typeof params !== "object" || Array.isArray(params)) return null
    return { fromDate: params.fromDate, toDate: params.toDate }
  } catch {
    return null
  }
}

/** Optional `desde`/`hasta`: blank values are omitted, unusable ones are refused. */
export function dashboardQuery(params: DashboardParams): { desde?: string; hasta?: string } {
  const window = normalizeDashboardParams(params)
  if (!window) return invalidInput()
  return {
    ...(window.fromDate !== undefined ? { desde: window.fromDate } : {}),
    ...(window.toDate !== undefined ? { hasta: window.toDate } : {})
  }
}

export function dashboardView(value: unknown): DashboardView {
  const response = record(value)
  const actual = record(response["actual"])
  const period = record(response["periodo"])
  const current: CurrentSituation = {
    ordersByState: stateCounts(actual["ordenesPorEstado"]),
    servicesToday: count(actual["serviciosHoy"]),
    servicesNext7Days: count(actual["serviciosProximos7Dias"]),
    unscheduledOrders: count(actual["ordenesSinProgramar"]),
    requestsPending: count(actual["solicitudesPorAtender"]),
    openSupportRequests: count(actual["atencionesAbiertas"]),
    servicesPerDay: dailySeries(actual["serviciosPorDia"]),
    next7DaysLoad: collaboratorLoad(actual["cargaProximos7Dias"])
  }
  const fromDate = day(period["desde"])
  const toDate = day(period["hasta"])
  // The supplied period is ordered; an inverted one is a malformed response.
  if (fromDate > toDate) return invalid()
  const activity: PeriodActivity = {
    fromDate,
    toDate,
    requestsRegistered: count(period["solicitudesRegistradas"]),
    ordersCreated: count(period["ordenesCreadas"]),
    ordersCompleted: count(period["ordenesCompletadas"]),
    ordersCancelled: count(period["ordenesCanceladas"]),
    // Null means the window closed nothing; it is preserved as null, never zeroed.
    complianceRate:
      period["tasaCumplimiento"] === null ? null : decimal(period["tasaCumplimiento"]),
    completedAmount: decimal(period["montoCompletado"]),
    complaints: count(period["quejas"])
  }
  return { generatedAt: instant(response["generadoEn"]), current, period: activity }
}

export function dashboardError(error: unknown): DashboardError {
  if (error instanceof DashboardError) return failure(error.code)
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
    return failure("UNAVAILABLE")
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status >= 200 && error.status < 300) return failure("INVALID_RESPONSE")
    const codes: Record<number, DashboardErrorCode> = {
      0: "UNAVAILABLE",
      400: "VALIDATION",
      401: "UNAUTHENTICATED",
      403: "FORBIDDEN"
    }
    return failure(codes[error.status] ?? (error.status >= 500 ? "UNAVAILABLE" : "UNEXPECTED"))
  }
  return failure("UNEXPECTED")
}
