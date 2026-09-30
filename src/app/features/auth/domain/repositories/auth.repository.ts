import { UserSession } from "@/app/features/auth/domain/entities/user-session.entity"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { Result } from "@/app/shared/utils/result"
import { Observable } from "rxjs"
import { LoginParams } from "../params/login.params"
import { InjectionToken } from "@angular/core"

export interface AuthRepository {
  login(params: LoginParams): Observable<Result<void, AuthError>>
  me(): Observable<Result<UserSession, AuthError>>
  logout(): void
}

export const AUTH_REPOSITORY = new InjectionToken<AuthRepository>("auth.repository")
