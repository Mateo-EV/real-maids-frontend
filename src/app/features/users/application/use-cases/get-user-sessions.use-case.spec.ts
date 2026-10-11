import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { GetUserSessionsUseCase } from "./get-user-sessions.use-case"

describe("GetUserSessionsUseCase", () => {
  it("returns repository success and typed failure unchanged", async () => {
    const success = Result.success({ items: [], page: 0, size: 20, total: 0, totalPages: 0 }),
      failure = Result.failure(new UserSessionError("UNEXPECTED"))
    const getUserSessions = vi
      .fn()
      .mockReturnValueOnce(of(success))
      .mockReturnValueOnce(of(failure))
    TestBed.configureTestingModule({
      providers: [{ provide: USER_SESSION_REPOSITORY, useValue: { getUserSessions } }]
    })
    const useCase = TestBed.inject(GetUserSessionsUseCase)
    expect(await firstValueFrom(useCase.execute({ userId: 42, page: 1, size: 5 }))).toBe(success)
    expect(getUserSessions).toHaveBeenNthCalledWith(1, { userId: 42, page: 1, size: 5 })
    expect(await firstValueFrom(useCase.execute())).toBe(failure)
    expect(getUserSessions).toHaveBeenCalledTimes(2)
  })
})
