import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { User } from "../../domain/entities/user.entity"
import { UserError } from "../../domain/errors/user.error"
import { UpdateUserParams } from "../../domain/params/update-user.params"
import { USER_REPOSITORY, UserRepository } from "../../domain/repositories/user.repository"

@Injectable({ providedIn: "root" })
export class UpdateUserByIdUseCase {
  private readonly userRepository = inject<UserRepository>(USER_REPOSITORY)

  execute(id: number, params: UpdateUserParams): Observable<Result<User, UserError>> {
    return this.userRepository.updateUserById(id, params)
  }
}
