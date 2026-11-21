import type { ParamMap } from "@angular/router"
import type {
  NormalizedPagination,
  PaginationParams
} from "@/app/shared/pagination/pagination.params"

/**
 * WP11 T3 / S4 — the staff experience's paging contract.
 *
 * The staff URL never publishes `offset`/`limit`: it publishes the `page`/`size` pair a field staff
 * member can read back in the address bar, and this module is the only place that translates between
 * the two. «Mis servicios» reads its entry page here, every row link and the detail's return link
 * serialize their effective page here, and no page performs the arithmetic, keeps a private copy of
 * the fallback or decides on its own whether a size may travel.
 *
 * Whole-pair fallback is the rule: nothing is clamped, half-corrected or invented. A missing,
 * duplicated, malformed, fractional, negative, out-of-int32 or above-the-documented-maximum pair
 * becomes the documented first page as a whole, so a hand-edited URL can never dispatch a page the
 * backend did not agree to return.
 */

const maxInt32 = 2147483647

/** Documented backend maximum page size. A larger size is out of contract and never dispatched. */
export const staffServicesMaxPageSize = 100

/** The documented first page; also the whole-pair fallback for every malformed context. */
export const staffServicesFirstPage: Readonly<NormalizedPagination> = Object.freeze({
  offset: 0,
  limit: 20
})

/** The `page`/`size` pair a row link and a return link carry. */
export interface StaffServicesPagingLink {
  readonly page: number
  readonly size: number
}

const firstPage = (): NormalizedPagination => ({ ...staffServicesFirstPage })

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
 * The entry context of «Mis servicios», read once from the route snapshot: `page` is a zero-based
 * index, `size` is the page length, and the read receives `offset = page × size` with that size as
 * its limit. Both keys must appear exactly once, and an above-maximum size is refused rather than
 * clamped, because this consumer must not ask the backend for a page it documents as unservable.
 */
export function staffServicesPageContext(params: ParamMap): NormalizedPagination {
  if (params.getAll("page").length !== 1 || params.getAll("size").length !== 1) return firstPage()
  const page = decimal(params.get("page"), 0)
  const size = decimal(params.get("size"), 1)
  if (page === null || size === null || size > staffServicesMaxPageSize) return firstPage()
  const offset = page * size
  // Unreachable while the size cap above holds, kept so the derived offset stays provably safe.
  return Number.isSafeInteger(offset) ? { offset, limit: size } : firstPage()
}

/**
 * The paging context of a link, derived from the effective metadata the consumer is showing. It
 * refuses exactly what the reader refuses — unaligned offsets, invalid numbers and sizes above the
 * documented maximum — so a link the staff experience emits is always a link it accepts back.
 */
export function staffServicesPagingParams(context: PaginationParams): StaffServicesPagingLink {
  const offset = context.offset === undefined ? 0 : context.offset
  const limit = context.limit === undefined ? 20 : context.limit
  return Number.isSafeInteger(offset) &&
    offset >= 0 &&
    Number.isSafeInteger(limit) &&
    limit > 0 &&
    limit <= staffServicesMaxPageSize &&
    offset % limit === 0 &&
    offset / limit <= maxInt32
    ? { page: offset / limit, size: limit }
    : { page: 0, size: 20 }
}

/**
 * A service route id is a positive decimal int32 that appears exactly once; anything else dispatches
 * no read. Duplicates are refused here for the same reason they are refused in the page/size pair.
 */
export function staffServiceRouteId(params: ParamMap): number | null {
  return params.getAll("id").length === 1 ? decimal(params.get("id"), 1) : null
}
