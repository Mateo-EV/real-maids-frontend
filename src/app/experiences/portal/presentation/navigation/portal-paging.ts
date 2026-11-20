import type { ParamMap } from "@angular/router"
import type { PaginationParams } from "@/app/shared/pagination/pagination.params"

/**
 * WP10 — the portal's single paging contract.
 *
 * The portal URL never publishes `offset`/`limit`, which is the read contract: it publishes the
 * `page`/`size` pair a customer can read back in the address bar, and this module is the only place
 * that translates between the two. Every portal list reads its entry page here, every row link and
 * every return link serializes its effective page here, and no page performs the arithmetic, keeps a
 * private copy of the fallback or decides on its own whether a size may travel.
 *
 * Whole-pair fallback is the rule: nothing is clamped, half-corrected or invented. A missing,
 * duplicated, malformed, fractional, negative, out-of-int32 or above-the-documented-maximum pair
 * becomes the documented first page as a whole, so a hand-edited URL can never dispatch a page the
 * backend did not agree to return.
 */

const maxInt32 = 2147483647

/** Documented backend maximum page size. A larger size is out of contract and never dispatched. */
export const portalMaxPageSize = 100

/** The documented first page; also the whole-pair fallback for every malformed context. */
export const portalFirstPage: Readonly<Required<PaginationParams>> = Object.freeze({
  offset: 0,
  limit: 20
})

/** The `page`/`size` pair a row link and a return link carry. */
export interface PortalPagingLink {
  readonly page: number
  readonly size: number
}

const firstPage = (): Required<PaginationParams> => ({ ...portalFirstPage })

/**
 * A decimal nonnegative int32, or nothing. Angular link helpers can supply numeric values through
 * `convertToParamMap`, so the raw value is normalized as text first; anything that is not plain
 * decimal digits (a sign, a decimal point, an exponent, padding, an empty string) is not a number
 * this contract accepts.
 */
function decimal(value: string | null, minimum: number): number | null {
  if (value === null) return null
  const text = String(value)
  if (text.length === 0 || /[^0-9]/.test(text)) return null
  const number = Number(text)
  return Number.isSafeInteger(number) && number >= minimum && number <= maxInt32 ? number : null
}

/**
 * The entry context of a portal list, read once from the route snapshot: `page` is a zero-based
 * index, `size` is the page length, and the read receives `offset = page × size` with that size as
 * its limit. Both keys must appear exactly once, and an above-maximum size is refused rather than
 * clamped, because the portal must not ask the backend for a page it documents as unservable.
 */
export function portalPageContext(params: ParamMap): Required<PaginationParams> {
  if (params.getAll("page").length !== 1 || params.getAll("size").length !== 1) return firstPage()
  const page = decimal(params.get("page"), 0)
  const size = decimal(params.get("size"), 1)
  if (page === null || size === null || size > portalMaxPageSize) return firstPage()
  const offset = page * size
  // Unreachable while the size cap above holds, kept so the derived offset stays provably safe.
  return Number.isSafeInteger(offset) ? { offset, limit: size } : firstPage()
}

/**
 * The paging context of a link, derived from the effective metadata the list is showing. It refuses
 * exactly what the reader refuses — unaligned offsets, invalid numbers and sizes above the documented
 * maximum — so a link the portal emits is always a link the portal accepts back.
 */
export function portalPagingParams(context: PaginationParams): PortalPagingLink {
  const offset = context.offset === undefined ? 0 : context.offset
  const limit = context.limit === undefined ? 20 : context.limit
  return Number.isSafeInteger(offset) &&
    offset >= 0 &&
    Number.isSafeInteger(limit) &&
    limit > 0 &&
    limit <= portalMaxPageSize &&
    offset % limit === 0 &&
    offset / limit <= maxInt32
    ? { page: offset / limit, size: limit }
    : { page: 0, size: 20 }
}

/**
 * A record route id is a positive decimal int32 that appears exactly once; anything else dispatches no
 * read. Duplicates are refused here for the same reason they are refused in the page/size pair.
 */
export function portalRouteId(params: ParamMap): number | null {
  return params.getAll("id").length === 1 ? decimal(params.get("id"), 1) : null
}
