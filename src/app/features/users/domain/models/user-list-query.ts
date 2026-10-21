export interface UserListQuery {
  readonly page: number
  readonly size: number
  readonly search?: string
  readonly roleId?: number
  readonly isActive?: boolean
}
