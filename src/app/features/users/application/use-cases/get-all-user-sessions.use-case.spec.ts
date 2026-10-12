import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, Subject } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { UserSession } from "../../domain/entities/user-session.entity"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { GetUserSessionsUseCase } from "./get-user-sessions.use-case"
import { GetAllUserSessionsUseCase } from "./get-all-user-sessions.use-case"

const session = UserSession.create(
  17,
  42,
  "192.0.2.1",
  "Browser",
  new Date("2026-01-01T00:00:00Z"),
  new Date("2026-01-02T00:00:00Z"),
  false,
  "Real",
  "real@example.test"
)
describe("GetAllUserSessionsUseCase single collection delegation", () => {
  const query = { execute: vi.fn() }
  beforeEach(() => {
    vi.resetAllMocks()
    TestBed.configureTestingModule({
      providers: [{ provide: GetUserSessionsUseCase, useValue: query }]
    })
  })
  it.each([[[]], [[session]]])(
    "preserves the entity array and observable with one read %#",
    async items => {
      const result = Result.success(items)
      const response = of(result)
      query.execute.mockReturnValue(response)
      const returned = TestBed.inject(GetAllUserSessionsUseCase).execute()
      expect(returned).toBe(response)
      expect(await firstValueFrom(returned)).toBe(result)
      expect(query.execute).toHaveBeenCalledExactlyOnceWith()
    }
  )
  it("passes failures through without retry or a subsequent page", async () => {
    const result = Result.failure(new UserSessionError("NETWORK"))
    query.execute.mockReturnValue(of(result))
    expect(await firstValueFrom(TestBed.inject(GetAllUserSessionsUseCase).execute())).toBe(result)
    expect(query.execute).toHaveBeenCalledExactlyOnceWith()
  })
  it("keeps calls stateless and permits component-owned cancellation", async () => {
    const pending = new Subject<Result<UserSession[], UserSessionError>>()
    query.execute.mockReturnValueOnce(pending).mockReturnValueOnce(of(Result.success([session])))
    const useCase = TestBed.inject(GetAllUserSessionsUseCase)
    const subscription = useCase.execute().subscribe()
    expect(pending.observed).toBe(true)
    subscription.unsubscribe()
    expect(pending.observed).toBe(false)
    expect(await firstValueFrom(useCase.execute())).toMatchObject({
      success: true,
      data: [session]
    })
    expect(query.execute).toHaveBeenCalledTimes(2)
  })
})
