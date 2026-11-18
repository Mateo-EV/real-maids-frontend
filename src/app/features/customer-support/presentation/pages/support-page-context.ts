import type { ParamMap } from "@angular/router"
import type { PaginationParams } from "@/app/shared/pagination/pagination.params"

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
 * Detail-route URL context: only the offset/limit the inbox actually owns. Filters stay
 * in-memory page state and are never serialized here; a missing, duplicated or malformed
 * pair falls back to the documented 0/20 defaults.
 */
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

/** The effective page the list is showing, as the only query parameters it may link with. */
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

/** A support route id is a positive decimal int32; anything else dispatches no read. */
export function supportRouteId(value: string | null): number | null {
  const id = decimal(value)
  return id !== null && id > 0 ? id : null
}
