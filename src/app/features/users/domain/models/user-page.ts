import { User } from "../entities/user.entity"

export interface UserPage {
  readonly items: User[]
  readonly page: number
  readonly size: number
  readonly total: number
  readonly totalPages: number
}
