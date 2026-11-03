import { ParamMap } from "@angular/router"
import { NormalizedPagination } from "@/app/shared/pagination/pagination.params"

/** Lead-route URL context only; independent of the customer list and its query state. */
export function leadPageContext(params: ParamMap): NormalizedPagination {
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
