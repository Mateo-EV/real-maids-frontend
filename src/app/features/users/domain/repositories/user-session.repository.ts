import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserSession } from "../entities/user-session.entity"
import { UserSessionError } from "../errors/user-session.error"

import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { UserSessionOwner } from "../models/user-session-owner"
import { UserSessionOwnerQuery } from "../models/user-session-owner-query"

export interface UserSessionRepository {
  getSessionOwners(
    query: UserSessionOwnerQuery
  ): Observable<Result<PaginationResponse<UserSessionOwner>, UserSessionError>>
  getSessionCount(): Observable<Result<number, UserSessionError>>
  getUserSessionsByUser(userId: number): Observable<Result<UserSession[], UserSessionError>>
  revokeUserSession(userId: number, id: number): Observable<Result<void, UserSessionError>>
  revokeUserSessions(userId: number): Observable<Result<void, UserSessionError>>
}

export const USER_SESSION_REPOSITORY = new InjectionToken<UserSessionRepository>(
  "user-session.repository"
)
