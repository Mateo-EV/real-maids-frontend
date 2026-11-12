import { PaginationParams } from "@/app/shared/pagination/pagination.params"

/**
 * Lead inbox filters are applied by the server before pagination. They live in page state
 * only: the lead list/detail URLs carry the `offset`/`limit` return context alone.
 */
export interface LeadListQuery extends PaginationParams {
  readonly search?: string
  readonly originId?: number
  readonly stageId?: number
  readonly converted?: boolean
}
