import { Lang } from "@/app/features/users/domain/entities/user.entity"

export interface CreateUserParams {
  readonly name: string
  readonly age: number
  readonly email: string
  readonly password: string
  readonly lang: Lang
  readonly isActive: boolean
  readonly roleId: number
  // FICTITIOUS DEMO DATA only: initialization metadata, not real authentication activity.
  // Omitted/null means never accessed. TODO integration: use confirmed backend profile metadata.
  readonly lastAccess?: Date | null
}
