import { inject, Injectable } from "@angular/core"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"

@Injectable({ providedIn: "root" })
export class GetUserSessionsUseCase {
  private readonly repository = inject(USER_SESSION_REPOSITORY)
  execute() {
    return this.repository.getUserSessions()
  }
}
