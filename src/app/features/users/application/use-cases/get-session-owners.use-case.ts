import { inject, Injectable } from "@angular/core"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { UserSessionOwnerQuery } from "../../domain/models/user-session-owner-query"

@Injectable({ providedIn: "root" })
export class GetSessionOwnersUseCase {
  private readonly repository = inject(USER_SESSION_REPOSITORY)
  execute(query: UserSessionOwnerQuery) {
    return this.repository.getSessionOwners(query)
  }
}
