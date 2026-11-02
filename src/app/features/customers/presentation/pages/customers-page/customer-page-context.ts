import { ParamMap } from "@angular/router"
import { NormalizedPagination } from "@/app/shared/pagination/pagination.params"

/** Untrusted URL context follows the customer transport's aligned int32 page/size contract. */
export function customerPageContext(params: ParamMap): NormalizedPagination {
  const offsetText = params.get("offset"),
    limitText = params.get("limit")
  const offset = Number(offsetText),
    limit = Number(limitText)
  return params.getAll("offset").length === 1 &&
    params.getAll("limit").length === 1 &&
    /^\d+$/.test(offsetText ?? "") &&
    /^\d+$/.test(limitText ?? "") &&
    Number.isSafeInteger(offset) &&
    Number.isSafeInteger(limit) &&
    limit > 0 &&
    limit <= 2147483647 &&
    offset % limit === 0 &&
    offset / limit <= 2147483647
    ? { offset, limit }
    : { offset: 0, limit: 20 }
}
