import { DOCUMENT, isPlatformBrowser } from "@angular/common"
import { inject, Injectable, PLATFORM_ID } from "@angular/core"
import { LoginParams } from "../../domain/params/login.params"
import { map, Observable, timer } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserSession } from "../../domain/entities/user-session.entity"
import { AuthError } from "../../domain/errors/auth.error"

const DEMO_AUTH = {
  email: "riojamatthew@gmail.com",
  password: "demo2026",
  name: "Mateo"
} as const

@Injectable({ providedIn: "root" })
export class AuthInMemorySource {
  private readonly platformId = inject(PLATFORM_ID)
  private readonly document = inject(DOCUMENT)

  private get storage(): Storage | null {
    if (!isPlatformBrowser(this.platformId)) return null
    try {
      return this.document.defaultView?.localStorage ?? null
    } catch {
      return null
    }
  }

  private get authenticated(): boolean {
    try {
      return this.storage?.getItem("authenticated") === "true"
    } catch {
      return false
    }
  }

  private setAuthenticated(authenticated: boolean): boolean {
    try {
      const storage = this.storage
      if (!storage) return false
      storage.setItem("authenticated", authenticated ? "true" : "false")
      return true
    } catch {
      return false
    }
  }

  login(params: LoginParams): Observable<Result<void, AuthError>> {
    const input = { email: params.email, password: params.password }
    return timer(650).pipe(
      map(() => {
        const hasValidCredentials =
          input.email.trim().toLowerCase() === DEMO_AUTH.email &&
          input.password === DEMO_AUTH.password
        const stored = this.setAuthenticated(hasValidCredentials)

        return !hasValidCredentials
          ? Result.failure(new AuthError("INVALID_CREDENTIALS"))
          : stored
            ? Result.success<void>(undefined)
            : Result.failure(new AuthError("UNEXPECTED"))
      })
    )
  }

  me(): Observable<Result<UserSession, AuthError>> {
    return timer(250).pipe(
      map(() =>
        this.authenticated
          ? Result.success(UserSession.create(DEMO_AUTH.name, DEMO_AUTH.email))
          : Result.failure(new AuthError("UNEXPECTED"))
      )
    )
  }

  logout(): void {
    this.setAuthenticated(false)
  }
}
