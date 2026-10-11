import { TestBed } from "@angular/core/testing"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthRepository, AUTH_REPOSITORY } from "../../domain/repositories/auth.repository"
import { LogoutUseCase } from "./logout.use-case"

describe("LogoutUseCase", () => {
  let useCase: LogoutUseCase
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
      providers: [LogoutUseCase, { provide: AUTH_REPOSITORY, useValue: repository }]
    })

    useCase = TestBed.inject(LogoutUseCase)
  })

  it("delegates logout to the repository", () => {
    useCase.execute()

    expect(repository.logout).toHaveBeenCalledOnce()
  })
})
