import { InjectionToken } from "@angular/core"

import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserSession } from "../entities/user-session.entity"
import { UserSessionError } from "../errors/user-session.error"

export interface UserSessionRepository {
  getUserSessions(): Observable<Result<UserSession[], UserSessionError>>
  revokeUserSession(userId: number, id: number): Observable<Result<void, UserSessionError>>
}

export const USER_SESSION_REPOSITORY = new InjectionToken<UserSessionRepository>(
  "user-session.repository"
)
