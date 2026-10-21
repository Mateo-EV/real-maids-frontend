import { inject, Injectable } from "@angular/core"
import { USER_REPOSITORY } from "../../domain/repositories/user.repository"
import { UserListQuery } from "../../domain/models/user-list-query"

@Injectable({ providedIn: "root" })
export class GetUsersPageUseCase {
  private readonly repository = inject(USER_REPOSITORY)

  execute(query: UserListQuery) {
    return this.repository.getUsersPage(query)
  }
}
