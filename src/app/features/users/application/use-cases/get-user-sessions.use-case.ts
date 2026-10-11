import { inject, Injectable } from "@angular/core"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"

import { UserSessionQuery } from "../../domain/models/user-session-query"

@Injectable({ providedIn: "root" })
export class GetUserSessionsUseCase {
  private readonly repository = inject(USER_SESSION_REPOSITORY)
  execute(query: UserSessionQuery = {}) {
    return this.repository.getUserSessions(query)
  }
}
