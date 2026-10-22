import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { GetSessionOwnersUseCase } from "./get-session-owners.use-case"
import { GetSessionCountUseCase } from "./get-session-count.use-case"

describe("Scoped session reads", () => {
  it("delegates owner pagination and exact count once, preserving success/failure references", async () => {
    const ownerResult = Result.success({ items: [], total: 0, offset: 0, limit: 5 })
    const countResult = Result.success(1234)
    const forbidden = Result.failure(new UserSessionError("FORBIDDEN"))
    const getSessionOwners = vi
      .fn()
      .mockReturnValueOnce(of(ownerResult))
      .mockReturnValueOnce(of(forbidden))
    const getSessionCount = vi
      .fn()
      .mockReturnValueOnce(of(countResult))
      .mockReturnValueOnce(of(forbidden))
    TestBed.configureTestingModule({
      providers: [
        { provide: USER_SESSION_REPOSITORY, useValue: { getSessionOwners, getSessionCount } }
      ]
    })
    const owners = TestBed.inject(GetSessionOwnersUseCase),
      count = TestBed.inject(GetSessionCountUseCase)
    const query = { offset: 10, limit: 5, hasSessions: false }
    expect(await firstValueFrom(owners.execute(query))).toBe(ownerResult)
    expect(getSessionOwners).toHaveBeenCalledExactlyOnceWith(query)
    expect(await firstValueFrom(count.execute())).toBe(countResult)
    expect(getSessionCount).toHaveBeenCalledExactlyOnceWith()
    expect(await firstValueFrom(owners.execute({}))).toBe(forbidden)
    expect(await firstValueFrom(count.execute())).toBe(forbidden)
  })
})
