import type { ParamMap } from "@angular/router"
import type { PaginationParams } from "@/app/shared/pagination/pagination.params"

const maxInt32 = 2147483647
const defaultPaging = (): Required<PaginationParams> => ({ offset: 0, limit: 20 })

function decimal(value: string | null, minimum: number): number | null {
  if (value === null) return null
  // Angular link helpers can supply numeric values through convertToParamMap.
  const text = String(value)
  if (text.length === 0 || /[^0-9]/.test(text)) return null
  const number = Number(text)
  return Number.isSafeInteger(number) && number >= minimum && number <= maxInt32 ? number : null
}

/**
 * WP10 T5 / S7 — the portal's own-support URL contract, the same one the portal request and order
 * lists already use: `page` is a zero-based index and `size` the page length, while the read keeps
 * its `offset`/`limit` contract. The staff support page context parses `offset`/`limit` because its
 * inbox publishes them in the URL; the portal never does, so the two contracts stay separate.
 *
 * A missing, duplicated, negative, fractional, non-numeric or out-of-int32 pair falls back to the
 * documented first page as a whole — never a clamped size and never an invented offset.
 */
export function portalSupportPageContext(params: ParamMap): Required<PaginationParams> {
  if (params.getAll("page").length !== 1 || params.getAll("size").length !== 1)
    return defaultPaging()
  const page = decimal(params.get("page"), 0),
    size = decimal(params.get("size"), 1)
  return page !== null && size !== null && Number.isSafeInteger(page * size)
    ? { offset: page * size, limit: size }
    : defaultPaging()
}

/** The `page`/`size` pair a detail link and the return link carry: the effective page. */
export function portalSupportPagingParams(context: PaginationParams): {
  page: number
  size: number
} {
  const offset = context.offset === undefined ? 0 : context.offset,
    limit = context.limit === undefined ? 20 : context.limit
  return Number.isSafeInteger(offset) &&
    offset >= 0 &&
    Number.isSafeInteger(limit) &&
    limit > 0 &&
    limit <= maxInt32 &&
    offset % limit === 0 &&
    offset / limit <= maxInt32
    ? { page: offset / limit, size: limit }
    : { page: 0, size: 20 }
}

/** A support route id is a positive decimal int32; anything else dispatches no read. */
export function portalSupportRouteId(value: string | null): number | null {
  return decimal(value, 1)
}
