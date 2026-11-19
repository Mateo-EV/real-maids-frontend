/**
 * Optional window for `GET /api/dashboard`. Dates are literal calendar days
 * (`YYYY-MM-DD`), never browser-timezone instants, and an absent or blank date
 * is omitted from the request so the backend keeps its own default (30 days).
 */
export interface DashboardParams {
  fromDate?: string
  toDate?: string
}

/** Literal `YYYY-MM-DD` day, validated by calendar arithmetic instead of a timezone. */
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

const unusable = null

/**
 * Getter-safe normalization of the optional window, shared by the transport and the
 * store so both refuse the same inputs. A blank value means "not narrowed"; a
 * supplied value that is not a real calendar day, or a pair whose range is inverted,
 * is unusable and yields `undefined` (the caller reports `VALIDATION`).
 */
export function normalizeDashboardParams(
  params: DashboardParams = {}
): DashboardParams | undefined {
  try {
    if (!params || typeof params !== "object" || Array.isArray(params)) return undefined
    const day = (value: unknown) => {
      if (value === undefined) return undefined
      if (typeof value !== "string") return unusable
      const trimmed = value.trim()
      if (!trimmed) return undefined
      return isCalendarDay(trimmed) ? trimmed : unusable
    }
    const fromDate = day(params.fromDate)
    const toDate = day(params.toDate)
    if (fromDate === unusable || toDate === unusable) return undefined
    // The window is inclusive and ordered; an inverted pair is never silently swapped.
    if (fromDate !== undefined && toDate !== undefined && fromDate > toDate) return undefined
    return {
      ...(fromDate !== undefined ? { fromDate } : {}),
      ...(toDate !== undefined ? { toDate } : {})
    }
  } catch {
    return undefined
  }
}
