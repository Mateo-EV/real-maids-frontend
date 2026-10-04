import { Lang } from "@/app/features/users/domain/entities/user.entity"

export interface UpdateUserParams {
  readonly name: string
  readonly age: number
  readonly email: string
  readonly password?: string
  readonly lang: Lang
  readonly isActive: boolean
}
