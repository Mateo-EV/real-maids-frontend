import { PaginationParams } from "@/app/shared/pagination/pagination.params"

export interface UserSessionOwnerQuery extends PaginationParams {
  search?: string
  hasSessions?: boolean
}
