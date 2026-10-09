import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { RevokeUserSessionUseCase } from "./revoke-user-session.use-case"

describe("RevokeUserSessionUseCase", () => {
  it("forwards both IDs and preserves success/failure", async () => {
    const success = Result.success<void>(undefined),
      failure = Result.failure(new UserSessionError("CURRENT_SESSION"))
    const revokeUserSession = vi
      .fn()
      .mockReturnValueOnce(of(success))
      .mockReturnValueOnce(of(failure))
    TestBed.configureTestingModule({
      providers: [{ provide: USER_SESSION_REPOSITORY, useValue: { revokeUserSession } }]
    })
    const useCase = TestBed.inject(RevokeUserSessionUseCase)
    expect(await firstValueFrom(useCase.execute(1, 2))).toBe(success)
    expect(revokeUserSession).toHaveBeenLastCalledWith(1, 2)
    expect(await firstValueFrom(useCase.execute(1, 1))).toBe(failure)
    expect(revokeUserSession).toHaveBeenLastCalledWith(1, 1)
  })
})
