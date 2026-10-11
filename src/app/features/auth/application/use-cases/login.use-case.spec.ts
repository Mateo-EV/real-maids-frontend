import { TestBed } from "@angular/core/testing"
import { of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { AuthRepository, AUTH_REPOSITORY } from "../../domain/repositories/auth.repository"
import { AuthSession } from "../../domain/entities/auth-session.entity"
import { AuthError } from "../../domain/errors/auth.error"
import { LoginUseCase } from "./login.use-case"

describe("LoginUseCase", () => {
  let useCase: LoginUseCase
  let repository: AuthRepository

  beforeEach(() => {
    repository = {
      login: vi.fn(),
      me: vi.fn(),
      logout: vi.fn(),
      invalidate: vi.fn(),
      sessionChanges: vi.fn()
    }

    TestBed.configureTestingModule({
      providers: [LoginUseCase, { provide: AUTH_REPOSITORY, useValue: repository }]
    })

    useCase = TestBed.inject(LoginUseCase)
  })

  it("returns the user session after a successful login", () => {
    const session = AuthSession.create("Administrador Demo", "admin@realmaids.com")
    vi.mocked(repository.login).mockReturnValue(of(Result.success<void>(undefined)))
    vi.mocked(repository.me).mockReturnValue(of(Result.success(session)))

    let emittedSession: AuthSession | undefined
    useCase.execute({ email: session.email, password: "demo2026" }).subscribe(result => {
      emittedSession = result.success ? result.data : undefined
    })

    expect(emittedSession).toBe(session)
  })

  it("does not request the session when credentials are rejected", () => {
    const error = new AuthError("INVALID_CREDENTIALS")
    vi.mocked(repository.login).mockReturnValue(of(Result.failure(error)))

    let emittedError: AuthError | undefined
    useCase.execute({ email: "wrong@realmaids.com", password: "incorrecta" }).subscribe(result => {
      emittedError = result.success ? undefined : result.error
    })

    expect(emittedError).toBe(error)
    expect(repository.me).not.toHaveBeenCalled()
  })
})
