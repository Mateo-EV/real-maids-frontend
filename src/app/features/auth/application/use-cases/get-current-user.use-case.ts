import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { AuthSession } from "../../domain/entities/auth-session.entity"
import { AuthError } from "../../domain/errors/auth.error"
import { AUTH_REPOSITORY } from "../../domain/repositories/auth.repository"

@Injectable({ providedIn: "root" })
export class GetCurrentUserUseCase {
  private readonly authRepository = inject(AUTH_REPOSITORY)

  execute(): Observable<Result<AuthSession, AuthError>> {
    return this.authRepository.me()
  }
}
