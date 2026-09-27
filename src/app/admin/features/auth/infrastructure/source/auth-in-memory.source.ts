import { Injectable } from "@angular/core"
import { LoginParams } from "../../domain/params/login.params"
import { delay, Observable, of } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserSession } from "../../domain/entities/user-session.entity"
import { AuthError } from "../../domain/errors/auth.error"
import { DEMO_AUTH } from "../../auth.demo"

@Injectable({ providedIn: "root" })
export class AuthInMemorySource {
  private authenticated = false

  login(params: LoginParams): Observable<Result<void, AuthError>> {
    const hasValidCredentials =
      params.email.trim().toLowerCase() === DEMO_AUTH.email &&
      params.password === DEMO_AUTH.password

    this.authenticated = hasValidCredentials

    const result: Result<void, AuthError> = hasValidCredentials
      ? Result.success<void>(undefined)
      : Result.failure(new AuthError("INVALID_CREDENTIALS"))

    return of(result).pipe(delay(650))
  }

  me(): Observable<Result<UserSession, AuthError>> {
    const result: Result<UserSession, AuthError> = this.authenticated
      ? Result.success(UserSession.create(DEMO_AUTH.name, DEMO_AUTH.email))
      : Result.failure(new AuthError("UNEXPECTED"))

    return of(result).pipe(delay(250))
  }

  logout(): void {
    this.authenticated = false
  }
}
