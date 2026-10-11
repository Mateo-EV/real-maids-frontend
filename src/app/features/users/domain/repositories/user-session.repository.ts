import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserSession } from "../entities/user-session.entity"
import { UserSessionError } from "../errors/user-session.error"
import { UserSessionQuery } from "../models/user-session-query"
import { UserSessionPage } from "../models/user-session-page"

export interface UserSessionRepository {
  getUserSessions(query?: UserSessionQuery): Observable<Result<UserSessionPage, UserSessionError>>
  getUserSessionsByUser(userId: number): Observable<Result<UserSession[], UserSessionError>>
  revokeUserSession(userId: number, id: number): Observable<Result<void, UserSessionError>>
  revokeUserSessions(userId: number): Observable<Result<void, UserSessionError>>
}

export const USER_SESSION_REPOSITORY = new InjectionToken<UserSessionRepository>(
  "user-session.repository"
)
