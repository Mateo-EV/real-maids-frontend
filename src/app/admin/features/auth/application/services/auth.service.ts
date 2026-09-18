import { Result } from "@/app/shared/utils/result"
import { inject, Injectable } from "@angular/core"
import { Observable, of, switchMap } from "rxjs"
import { LoginParams } from "../../domain/params/login.params"
import { AUTH_REPOSITORY, AuthRepository } from "../../domain/repositories/auth.repository"
import { UserSession } from "../../domain/entities/user-session.entity"
import { AuthError } from "../errors/auth.error"

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly authRepository = inject<AuthRepository>(AUTH_REPOSITORY)

  login(params: LoginParams): Observable<Result<UserSession, AuthError>> {
    return this.authRepository.login(params).pipe(
      switchMap((result): Observable<Result<UserSession, AuthError>> => {
        if (!result.success) {
          return of(Result.failure(result.error))
        }

        return this.authRepository.me()
      })
    )
  }

  logout(): void {
    this.authRepository.logout()
  }
}
