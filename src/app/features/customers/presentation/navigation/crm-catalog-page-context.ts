import { ParamMap } from "@angular/router"
import { NormalizedPagination } from "@/app/shared/pagination/pagination.params"

/**
 * Untrusted CRM catalog URL context for the customer and lead lists: one aligned `offset`/`limit`
 * pair, otherwise the 0/20 default. Both lists share this contract, and the transport decides the
 * effective size it sends back.
 */
export function crmCatalogPageContext(params: ParamMap): NormalizedPagination {
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
