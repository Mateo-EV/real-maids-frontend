import { Result } from "@/app/shared/utils/result"
import { NormalizedPagination, PaginationParams } from "./pagination.params"

export class PaginationError extends Error {
  readonly code = "INVALID_PAGINATION"

  constructor() {
    super("Offset must be a nonnegative safe integer and limit must be an integer from 1 to 100")
    this.name = "PaginationError"
  }
}

export function normalizePagination(
  params: PaginationParams = {}
): Result<NormalizedPagination, PaginationError> {
  const offset = params.offset === undefined ? 0 : params.offset
  const limit = params.limit === undefined ? 20 : params.limit
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    return Result.failure(new PaginationError())
  }
  return Result.success({ offset, limit })
}
