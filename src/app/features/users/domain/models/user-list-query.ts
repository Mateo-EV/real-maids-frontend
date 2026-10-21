import { PaginationParams } from "@/app/shared/pagination/pagination.params"

export interface UserListQuery extends PaginationParams {
  readonly search?: string
  readonly roleId?: number
  readonly isActive?: boolean
}
