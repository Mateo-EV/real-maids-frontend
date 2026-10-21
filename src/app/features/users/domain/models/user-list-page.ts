import { User } from "../entities/user.entity"

/** Validated business listing; transport names remain in the HTTP source. */
export interface UserListPage {
  readonly items: User[]
  readonly page: number
  readonly size: number
  readonly total: number
  readonly totalPages: number
}
