import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { CustomerType } from "../entities/customer.entity"

/** Customer listing filters are server-applied before pagination. */
export interface CustomerListQuery extends PaginationParams {
  readonly search?: string
  readonly type?: CustomerType
}
