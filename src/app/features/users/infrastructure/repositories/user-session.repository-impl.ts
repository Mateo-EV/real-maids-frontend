import { inject, Injectable } from "@angular/core"
import { UserSessionOwnerQuery } from "../../domain/models/user-session-owner-query"
import { UserSessionRepository } from "../../domain/repositories/user-session.repository"
import { UserSessionHttpSource } from "../source/user-session-http.source"

@Injectable({ providedIn: "root" })
export class UserSessionRepositoryImpl implements UserSessionRepository {
  private readonly source = inject(UserSessionHttpSource)
  getSessionOwners(query: UserSessionOwnerQuery) {
    return this.source.getSessionOwners(query)
  }
  getSessionCount() {
    return this.source.getSessionCount()
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
