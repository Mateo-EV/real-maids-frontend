import { NormalizedPagination, PaginationParams } from "@/app/shared/pagination/pagination.params"

/** Calendar dates; backend defines business timezone and default/max period. */
export interface ReportPeriodParams {
  from?: string
  to?: string
}

export interface GenerateReportParams extends ReportPeriodParams {
  type: string
}

/**
 * Server-paged history of generated reports: `offset`/`limit` map to `pagina`/`tamanio`.
 * The history is a read; it never generates.
 */
export interface ReportHistoryQuery extends PaginationParams {}

/** Literal `YYYY-MM-DD` day, validated by calendar arithmetic instead of a timezone. */
export function isReportCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

const unusable = null

/**
 * Getter-safe normalization of the optional period, shared by the transport and the store
 * so both refuse alike. Blank means "not narrowed" (the backend keeps its own default); a
 * supplied value that is not a real calendar day, or an inverted pair, is unusable.
 */
export function normalizeReportPeriod(
  params: ReportPeriodParams = {}
): ReportPeriodParams | undefined {
  try {
    if (!params || typeof params !== "object" || Array.isArray(params)) return undefined
    const day = (value: unknown) => {
      if (value === undefined) return undefined
      if (typeof value !== "string") return unusable
      const trimmed = value.trim()
      if (!trimmed) return undefined
      return isReportCalendarDay(trimmed) ? trimmed : unusable
    }
    const from = day(params.from)
    const to = day(params.to)
    if (from === unusable || to === unusable) return undefined
    // The period is inclusive and ordered; an inverted pair is never silently swapped.
    if (from !== undefined && to !== undefined && from > to) return undefined
    return {
      ...(from !== undefined ? { from } : {}),
      ...(to !== undefined ? { to } : {})
    }
  } catch {
    return undefined
  }
}

/**
 * One generation request: a literal type supplied by the verified catalog plus the optional
 * period. There is no invented default type, actor, format or business clock here.
 */
export function normalizeGenerateReportParams(
  params: GenerateReportParams
): GenerateReportParams | undefined {
  try {
    if (!params || typeof params !== "object" || Array.isArray(params)) return undefined
    if (typeof params.type !== "string") return undefined
    const type = params.type.trim()
    if (!type) return undefined
    const period = normalizeReportPeriod(params)
    if (period === undefined) return undefined
    return { type, ...period }
  } catch {
    return undefined
  }
}

/** Stable identity of one generation: a report belongs to exactly this type and period. */
export function reportRequestKey(params: GenerateReportParams): string {
  return JSON.stringify([params.type, params.from ?? null, params.to ?? null])
}

/** Zero-based page whose rows start at `offset`; the backend caps a page at 100 rows. */
export function normalizeReportHistoryQuery(
  query: ReportHistoryQuery = {}
): NormalizedPagination | undefined {
  try {
    if (!query || typeof query !== "object" || Array.isArray(query)) return undefined
    const offset = query.offset === undefined ? 0 : query.offset
    const limit = query.limit === undefined ? 20 : query.limit
    if (
      typeof offset !== "number" ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      typeof limit !== "number" ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      offset % limit !== 0 ||
      offset / limit > 2147483647
    )
      return undefined
    return { offset, limit }
  } catch {
    return undefined
  }
}

export interface CreateKpiDefinitionParams {
  name: string
  description: string | null
  formula: string | null
  unit: string | null
  target: string | null
  frequency: string | null
  isActive: boolean
}

export interface UpdateKpiDefinitionParams {
  name?: string
  description?: string | null
  formula?: string | null
  unit?: string | null
  target?: string | null
  frequency?: string | null
  isActive?: boolean
}

export interface KpiMeasurementQuery extends PaginationParams {
  periodStart?: string
  periodEnd?: string
}

/** Read only. Server must allowlist public keys, never return raw configuration. */
export interface PublicParameterQuery {
  keys: readonly string[]
}

export interface MigrationHistoryQuery extends PaginationParams {
  entity?: string
  sourceSystem?: string
}
