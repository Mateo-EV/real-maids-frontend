import { inject, Injectable } from "@angular/core"
import { Observable, of, switchMap } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { AuthError } from "../../domain/errors/auth.error"
import { AuthSession } from "../../domain/entities/auth-session.entity"
import { ChangePasswordParams } from "../../domain/params/change-password.params"
import { AUTH_REPOSITORY, AuthRepository } from "../../domain/repositories/auth.repository"

/**
 * A confirmed `PUT /api/auth/me/password` is not enough to open the application: the provisional
 * flag lives in the profile, so the change is followed by one forced `GET /api/auth/me`. A failed
 * read is reported as-is (an unconfirmed outcome), never as a rejected change and never replayed.
 */
@Injectable({ providedIn: "root" })
export class ChangePasswordUseCase {
  private readonly authRepository = inject<AuthRepository>(AUTH_REPOSITORY)

  execute(params: ChangePasswordParams): Observable<Result<AuthSession, AuthError>> {
    return this.authRepository
      .changePassword(params)
      .pipe(
        switchMap(result =>
          result.success ? this.authRepository.me(true) : of(Result.failure(result.error))
        )
      )
  }
}
