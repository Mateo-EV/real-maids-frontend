import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { RevokeUserSessionsUseCase } from "./revoke-user-sessions.use-case"

describe("RevokeUserSessionsUseCase", () => {
  it("delegates without inferring whose current session is retained or retrying failure", async () => {
    const success = Result.success(undefined),
      failure = Result.failure(new UserSessionError("FORBIDDEN"))
    const revokeUserSessions = vi
      .fn()
      .mockReturnValueOnce(of(success))
      .mockReturnValueOnce(of(failure))
    TestBed.configureTestingModule({
      providers: [{ provide: USER_SESSION_REPOSITORY, useValue: { revokeUserSessions } }]
    })
    const useCase = TestBed.inject(RevokeUserSessionsUseCase)
    expect(await firstValueFrom(useCase.execute(42))).toBe(success)
    expect(await firstValueFrom(useCase.execute(43))).toBe(failure)
    expect(revokeUserSessions).toHaveBeenNthCalledWith(1, 42)
    expect(revokeUserSessions).toHaveBeenNthCalledWith(2, 43)
    expect(revokeUserSessions).toHaveBeenCalledTimes(2)
  })
})
