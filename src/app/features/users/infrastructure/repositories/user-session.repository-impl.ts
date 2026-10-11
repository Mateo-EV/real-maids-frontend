import { inject, Injectable } from "@angular/core"
import { UserSessionRepository } from "../../domain/repositories/user-session.repository"
import { UserSessionQuery } from "../../domain/models/user-session-query"
import { UserSessionHttpSource } from "../source/user-session-http.source"

@Injectable({ providedIn: "root" })
export class UserSessionRepositoryImpl implements UserSessionRepository {
  private readonly source = inject(UserSessionHttpSource)
  getUserSessions(query: UserSessionQuery = {}) {
    return this.source.getUserSessions(query)
  }
  getUserSessionsByUser(userId: number) {
    return this.source.getUserSessionsByUser(userId)
  }
  revokeUserSession(userId: number, id: number) {
    return this.source.revokeUserSession(userId, id)
  }
  revokeUserSessions(userId: number) {
    return this.source.revokeUserSessions(userId)
  }
}
