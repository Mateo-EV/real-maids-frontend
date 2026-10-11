import { Result } from "@/app/shared/utils/result"
import { inject, Injectable } from "@angular/core"
import { Observable, of, switchMap } from "rxjs"
import { AuthError } from "../../domain/errors/auth.error"
import { LoginParams } from "../../domain/params/login.params"
import { AUTH_REPOSITORY, AuthRepository } from "../../domain/repositories/auth.repository"
import { AuthSession } from "../../domain/entities/auth-session.entity"

@Injectable({ providedIn: "root" })
export class LoginUseCase {
  private readonly authRepository = inject<AuthRepository>(AUTH_REPOSITORY)

  execute(params: LoginParams): Observable<Result<AuthSession, AuthError>> {
    return this.authRepository.login(params).pipe(
      switchMap((result): Observable<Result<AuthSession, AuthError>> => {
        if (!result.success) {
          return of(Result.failure(result.error))
        }

        return this.authRepository.me()
      })
    )
  }
}
