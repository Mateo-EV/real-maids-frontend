import { Lang } from "@/app/features/users/domain/entities/user.entity"

export interface UpdateUserParams {
  readonly name: string
  readonly age: number
  readonly email: string
  readonly password?: string
  readonly lang: Lang
  readonly isActive: boolean
  readonly roleId: number
  // lastAccess is read-only profile metadata; administrative edits never refresh it.
}
