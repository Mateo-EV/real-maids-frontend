import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserQuery } from "../../domain/models/user-query"
import { UserPage } from "../../domain/models/user-page"
import { UserError } from "../../domain/errors/user.error"
import { USER_REPOSITORY, UserRepository } from "../../domain/repositories/user.repository"

@Injectable({ providedIn: "root" })
export class GetUsersUseCase {
  private readonly userRepository = inject<UserRepository>(USER_REPOSITORY)

  execute(query: UserQuery = {}): Observable<Result<UserPage, UserError>> {
    return this.userRepository.getUsers(query)
  }
}
