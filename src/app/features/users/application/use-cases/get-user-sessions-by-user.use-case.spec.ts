import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { GetUserSessionsByUserUseCase } from "./get-user-sessions-by-user.use-case"

describe("GetUserSessionsByUserUseCase", () => {
  it("delegates the owner ID and preserves success/failure unchanged", async () => {
    const success = Result.success([]),
      failure = Result.failure(new UserSessionError("FORBIDDEN"))
    const getUserSessionsByUser = vi
      .fn()
      .mockReturnValueOnce(of(success))
      .mockReturnValueOnce(of(failure))
    TestBed.configureTestingModule({
      providers: [{ provide: USER_SESSION_REPOSITORY, useValue: { getUserSessionsByUser } }]
    })
    const useCase = TestBed.inject(GetUserSessionsByUserUseCase)
    expect(await firstValueFrom(useCase.execute(42))).toBe(success)
    expect(await firstValueFrom(useCase.execute(43))).toBe(failure)
    expect(getUserSessionsByUser).toHaveBeenNthCalledWith(1, 42)
    expect(getUserSessionsByUser).toHaveBeenNthCalledWith(2, 43)
  })
})
