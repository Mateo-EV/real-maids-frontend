export interface UserQuery {
  readonly page?: number
  readonly size?: number
  readonly search?: string
  readonly email?: string
  readonly roleId?: number
  readonly isActive?: boolean
}
