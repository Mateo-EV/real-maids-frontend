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

/** URL page is zero-based; reads retain their offset/limit contract. */
export function serviceOrderPageContext(params: ParamMap): Required<PaginationParams> {
  if (params.getAll("page").length !== 1 || params.getAll("size").length !== 1)
    return defaultPaging()
  const page = decimal(params.get("page"), 0),
    size = decimal(params.get("size"), 1)
  return page !== null && size !== null && Number.isSafeInteger(page * size)
    ? { offset: page * size, limit: size }
    : defaultPaging()
}

export function serviceOrderPagingParams(context: PaginationParams): {
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

export function serviceOrderRouteId(params: ParamMap): number | null {
  return params.getAll("id").length === 1 ? decimal(params.get("id"), 1) : null
}
