import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserError } from "../../domain/errors/user.error"
import { USER_REPOSITORY, UserRepository } from "../../domain/repositories/user.repository"

@Injectable({ providedIn: "root" })
export class DeleteUserByIdUseCase {
  private readonly userRepository = inject<UserRepository>(USER_REPOSITORY)

  execute(id: number): Observable<Result<void, UserError>> {
    return this.userRepository.deleteUserById(id)
  }
}
