import type { ParamMap } from "@angular/router"
import type { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { SUPPORT_STATE_CODES } from "../../domain/models/support-views"

const maxInt32 = 2147483647
// The backend caps a page at 100 rows and the store refuses a larger key (S13), so the
// URL context never carries a size the list itself could not request.
const maxLimit = 100
const defaults = (): Required<PaginationParams> => ({ offset: 0, limit: 20 })

function decimal(value: string | null): number | null {
  if (value === null) return null
  // Link helpers can supply numeric values through convertToParamMap.
  const text = String(value)
  if (text.length === 0 || text.length > 10 || /[^0-9]/.test(text)) return null
  const number = Number(text)
  return Number.isSafeInteger(number) && number >= 0 && number <= maxInt32 ? number : null
}

/**
 * The inbox filters the URL carries (S14). Blank means "no filter": the list is unfiltered
 * for that dimension, so the key is simply absent from the URL and from the query.
 */
export interface SupportFilterValues {
  readonly state: string
  readonly typeId: string
  readonly customerId: string
  readonly from: string
  readonly until: string
}

export const noSupportFilters: SupportFilterValues = {
  state: "",
  typeId: "",
  customerId: "",
  from: "",
  until: ""
}

/** One documented value per key: a duplicated parameter is not a filter. */
function single(params: ParamMap, key: string): string {
  const values = params.getAll(key)
  return values.length === 1 ? (values[0] ?? "") : ""
}

function positive(value: string): string {
  const id = decimal(value)
  return id !== null && id > 0 ? String(id) : ""
}

/** A calendar day is an ISO `YYYY-MM-DD` string, never a browser-local instant. */
function calendarDay(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ""
  const instant = Date.parse(`${value}T00:00:00Z`)
  return Number.isNaN(instant) || new Date(instant).toISOString().slice(0, 10) !== value
    ? ""
    : value
}

/**
 * Same rules for URL input and for values the page already holds, so a malformed or
 * unknown value falls back to "no filter" instead of dispatching a bad query. An
 * inverted range is dropped as a pair: the store refuses it and the user never asked
 * for a range that cannot be read.
 */
function normalize(filters: SupportFilterValues): SupportFilterValues {
  const from = calendarDay(filters.from)
  const until = calendarDay(filters.until)
  const inverted = !!from && !!until && from > until
  return {
    // S4: the closed backend enum; there is no status catalog to resolve another value.
    state: (SUPPORT_STATE_CODES as readonly string[]).includes(filters.state) ? filters.state : "",
    typeId: positive(filters.typeId),
    customerId: positive(filters.customerId),
    from: inverted ? "" : from,
    until: inverted ? "" : until
  }
}

/** Detail-route URL context: only the offset/limit the inbox actually owns. */
export function supportPageContext(params: ParamMap): Required<PaginationParams> {
  if (params.getAll("offset").length !== 1 || params.getAll("limit").length !== 1) return defaults()
  const offset = decimal(params.get("offset")),
    limit = decimal(params.get("limit"))
  return offset !== null &&
    limit !== null &&
    limit > 0 &&
    limit <= maxLimit &&
    offset % limit === 0 &&
    offset / limit <= maxInt32
    ? { offset, limit }
    : defaults()
}

/** The URL filters of a support list: unknown, duplicated, malformed and blank are dropped. */
export function supportFilterContext(params: ParamMap): SupportFilterValues {
  return normalize({
    state: single(params, "estado"),
    typeId: single(params, "idTipo"),
    customerId: single(params, "idCliente"),
    from: single(params, "desde"),
    until: single(params, "hasta")
  })
}

/** The effective page the list is showing, as the only paging it may link with. */
export function supportPagingParams(context: PaginationParams): Required<PaginationParams> {
  const offset = context.offset === undefined ? 0 : context.offset,
    limit = context.limit === undefined ? 20 : context.limit
  return Number.isSafeInteger(offset) &&
    offset >= 0 &&
    offset <= maxInt32 &&
    Number.isSafeInteger(limit) &&
    limit > 0 &&
    limit <= maxLimit &&
    offset % limit === 0 &&
    offset / limit <= maxInt32
    ? { offset, limit }
    : defaults()
}

/**
 * The documented query parameters of one filtered page, in a stable order. Blank filters
 * are omitted rather than serialized as empty values, so the URL never carries a key that
 * the list would not send.
 */
export function supportListParams(
  paging: PaginationParams,
  filters: SupportFilterValues = noSupportFilters
): Record<string, string> {
  const page = supportPagingParams(paging)
  const values = normalize(filters)
  const params: Record<string, string> = {
    offset: String(page.offset),
    limit: String(page.limit)
  }
  if (values.state) params["estado"] = values.state
  if (values.typeId) params["idTipo"] = values.typeId
  if (values.customerId) params["idCliente"] = values.customerId
  if (values.from) params["desde"] = values.from
  if (values.until) params["hasta"] = values.until
  return params
}

/** Canonical identity of a query context: key order never makes equal states look different. */
export function supportParamsKey(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join("&")
}

/** A support route id is a positive decimal int32; anything else dispatches no read. */
export function supportRouteId(value: string | null): number | null {
  const id = decimal(value)
  return id !== null && id > 0 ? id : null
}
