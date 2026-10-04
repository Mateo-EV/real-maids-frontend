import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { AUTH_REPOSITORY } from "../../domain/repositories/auth.repository"
import { UserSession } from "../../domain/entities/user-session.entity"
import { AuthError } from "../../domain/errors/auth.error"
import { GetCurrentUserUseCase } from "./get-current-user.use-case"

describe("GetCurrentUserUseCase", () => {
  const me = vi.fn()
  let useCase: GetCurrentUserUseCase

  beforeEach(() => {
    me.mockReset()
    TestBed.configureTestingModule({ providers: [
      { provide: AUTH_REPOSITORY, useValue: { me } }
    ] })
    useCase = TestBed.inject(GetCurrentUserUseCase)
  })

  it.each([
    Result.success(UserSession.create("Demo", "demo@example.com")),
    Result.failure(new AuthError("UNEXPECTED"))
  ])("delegates the repository result unchanged", async result => {
    const response = of(result)
    me.mockReturnValue(response)
    expect(useCase.execute()).toBe(response)
    expect(await firstValueFrom(response)).toBe(result)
    expect(me).toHaveBeenCalledOnce()
    expect(me).toHaveBeenCalledWith()
  })

  it("leaves observable error handling to its consumer", async () => {
    const error = new Error("offline")
    me.mockReturnValue(throwError(() => error))
    await expect(firstValueFrom(useCase.execute())).rejects.toBe(error)
  })
})
