import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { Result } from "@/app/shared/utils/result"
import { Observable } from "rxjs"
import { LoginParams } from "../params/login.params"
import { ChangePasswordParams } from "../params/change-password.params"
import { InjectionToken } from "@angular/core"

export interface AuthRepository {
  login(params: LoginParams): Observable<Result<void, AuthError>>
  /** `force` bypasses the published profile snapshot so a confirmed change is re-verified. */
  me(force?: boolean): Observable<Result<AuthSession, AuthError>>
  changePassword(params: ChangePasswordParams): Observable<Result<void, AuthError>>
  logout(): void
  invalidate(): void
  sessionChanges(): Observable<AuthSession | null>
}

export const AUTH_REPOSITORY = new InjectionToken<AuthRepository>("auth.repository")
