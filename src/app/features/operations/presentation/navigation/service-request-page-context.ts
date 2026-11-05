import type { ParamMap } from "@angular/router"
import type { PaginationParams } from "@/app/shared/pagination/pagination.params"

const maxInt32 = 2147483647
const defaultPaging = (): Required<PaginationParams> => ({ offset: 0, limit: 20 })
const decimal = (value: string | null, minimum: number): number | null => {
  if (value === null) return null
  // convertToParamMap also preserves numeric query-param values supplied by link helpers.
  const text = String(value)
  if (text.length === 0 || /[^0-9]/.test(text)) return null
  const number = Number(text)
  return Number.isSafeInteger(number) && number >= minimum && number <= maxInt32 ? number : null
}

/** URL page is a zero-based index; offset/limit remain the read contract. */
export function serviceRequestPageContext(params: ParamMap): Required<PaginationParams> {
  if (params.getAll("page").length !== 1 || params.getAll("size").length !== 1)
    return defaultPaging()
  const page = decimal(params.get("page"), 0),
    size = decimal(params.get("size"), 1)
  return page !== null && size !== null && Number.isSafeInteger(page * size)
    ? { offset: page * size, limit: size }
    : defaultPaging()
}

export function serviceRequestPagingParams(context: PaginationParams): {
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

export function serviceRequestRouteId(value: string | null): number | null {
  return decimal(value, 1)
}
