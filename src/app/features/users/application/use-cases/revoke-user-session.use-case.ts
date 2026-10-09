import { inject, Injectable } from "@angular/core"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"

@Injectable({ providedIn: "root" })
export class RevokeUserSessionUseCase {
  private readonly repository = inject(USER_SESSION_REPOSITORY)
  execute(userId: number, id: number) {
    return this.repository.revokeUserSession(userId, id)
  }
}
