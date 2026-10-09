import { inject, Injectable } from "@angular/core"
import { UserSessionRepository } from "../../domain/repositories/user-session.repository"
import { UserSessionInMemorySource } from "../source/user-session-in-memory.source"

@Injectable({ providedIn: "root" })
export class UserSessionRepositoryImpl implements UserSessionRepository {
  private readonly source = inject(UserSessionInMemorySource)
  getUserSessions() {
    return this.source.getUserSessions()
  }
  revokeUserSession(userId: number, id: number) {
    return this.source.revokeUserSession(userId, id)
  }
}
