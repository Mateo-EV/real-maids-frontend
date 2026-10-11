import { UserSession } from "../entities/user-session.entity"

export interface UserSessionPage {
  items: UserSession[]
  page: number
  size: number
  total: number
  totalPages: number
}
