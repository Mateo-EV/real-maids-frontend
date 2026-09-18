import { Result } from "@/app/shared/utils/result"
import { computed, inject, Injectable, signal } from "@angular/core"
import { Observable, of, switchMap, tap } from "rxjs"
import { LoginParams } from "../../domain/params/login.params"
import { AUTH_REPOSITORY, AuthRepository } from "../../domain/repositories/auth.repository"
import { UserSession } from "../../domain/entities/user-session.entity"
import { AuthError } from "../errors/auth.error"

@Injectable({ providedIn: "root" })
export class AuthService {
  private readonly authRepository = inject<AuthRepository>(AUTH_REPOSITORY)
  private readonly currentSession = signal<UserSession | null>(null)

  readonly session = this.currentSession.asReadonly()
  readonly isAuthenticated = computed(() => this.currentSession() !== null)

  login(params: LoginParams): Observable<Result<UserSession, AuthError>> {
    return this.authRepository.login(params).pipe(
      switchMap((result): Observable<Result<UserSession, AuthError>> => {
        if (!result.success) {
          return of(Result.failure(result.error))
        }

        return this.authRepository.me()
      }),
      tap(result => {
        if (result.success) {
          this.currentSession.set(result.data)
        }
      })
    )
  }

  logout(): void {
    this.authRepository.logout()
    this.currentSession.set(null)
  }
}
