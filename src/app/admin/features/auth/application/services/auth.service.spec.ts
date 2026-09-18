import { TestBed } from "@angular/core/testing"
import { of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { AuthRepository, AUTH_REPOSITORY } from "../../domain/repositories/auth.repository"
import { UserSession } from "../../domain/entities/user-session.entity"
import { AuthError } from "../errors/auth.error"
import { AuthService } from "./auth.service"

describe("AuthService", () => {
  let service: AuthService
  let repository: AuthRepository

  beforeEach(() => {
    repository = {
      login: vi.fn(),
      me: vi.fn(),
      logout: vi.fn()
    }

    TestBed.configureTestingModule({
      providers: [AuthService, { provide: AUTH_REPOSITORY, useValue: repository }]
    })

    service = TestBed.inject(AuthService)
  })

  it("returns the user session after a successful login", () => {
    const session = UserSession.create("Administrador Demo", "admin@realmaids.com")
    vi.mocked(repository.login).mockReturnValue(of(Result.success<void>(undefined)))
    vi.mocked(repository.me).mockReturnValue(of(Result.success(session)))

    let emittedSession: UserSession | undefined
    service.login({ email: session.email, password: "demo2026" }).subscribe(result => {
      emittedSession = result.success ? result.data : undefined
    })

    expect(emittedSession).toBe(session)
  })

  it("does not request the session when credentials are rejected", () => {
    const error = new AuthError("INVALID_CREDENTIALS")
    vi.mocked(repository.login).mockReturnValue(of(Result.failure(error)))

    let emittedError: AuthError | undefined
    service.login({ email: "wrong@realmaids.com", password: "incorrecta" }).subscribe(result => {
      emittedError = result.success ? undefined : result.error
    })

    expect(emittedError).toBe(error)
    expect(repository.me).not.toHaveBeenCalled()
  })

  it("delegates logout to the repository", () => {
    service.logout()

    expect(repository.logout).toHaveBeenCalledOnce()
  })
})
