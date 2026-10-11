import { TestBed } from "@angular/core/testing"
import { EMPTY, firstValueFrom, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { UserSession } from "../../domain/entities/user-session.entity"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { UserSessionPage } from "../../domain/models/user-session-page"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { GetAllUserSessionsUseCase } from "./get-all-user-sessions.use-case"

const session = (id: number, owner = 42, current = false) =>
  UserSession.create(
    id,
    owner,
    "192.0.2.1",
    "Browser",
    new Date("2026-01-01T10:00:00Z"),
    new Date("2027-01-01T10:00:00Z"),
    current,
    `User ${owner}`,
    `${owner}@example.test`
  )
const page = (index: number, total = 21): UserSessionPage => ({
  items: Array.from({ length: Math.min(20, Math.max(0, total - index * 20)) }, (_, i) =>
    session(index * 20 + i)
  ),
  page: index,
  size: 20,
  total,
  totalPages: Math.ceil(total / 20)
})
describe("GetAllUserSessionsUseCase", () => {
  let read: ReturnType<typeof vi.fn>
  beforeEach(() => {
    read = vi.fn(({ page: index }) => of(Result.success(page(index))))
    TestBed.configureTestingModule({
      providers: [{ provide: USER_SESSION_REPOSITORY, useValue: { getUserSessions: read } }]
    })
  })
  it("collects all global pages and emits only a complete collection", async () => {
    const result = await firstValueFrom(TestBed.inject(GetAllUserSessionsUseCase).execute())
    expect(result.success && result.data.items).toHaveLength(21)
    expect(read.mock.calls.map(call => call[0])).toEqual([
      { page: 0, size: 20 },
      { page: 1, size: 20 }
    ])
    expect(result.success && result.data.total).toBe(21)
  })
  it("accepts verified zero without a later request", async () => {
    read.mockReturnValue(of(Result.success(page(0, 0))))
    const result = await firstValueFrom(TestBed.inject(GetAllUserSessionsUseCase).execute())
    expect(result.success && result.data.items).toEqual([])
    expect(read).toHaveBeenCalledOnce()
  })
  it("returns later-page failures without partial data", async () => {
    read
      .mockReturnValueOnce(of(Result.success(page(0))))
      .mockReturnValueOnce(of(Result.failure(new UserSessionError("NETWORK"))))
    const result = await firstValueFrom(TestBed.inject(GetAllUserSessionsUseCase).execute())
    expect(!result.success && result.error.code).toBe("NETWORK")
  })
  it.each([
    "total",
    "duplicate",
    "owner",
    "email",
    "current",
    "page",
    "size",
    "order",
    "short",
    "bound"
  ])("rejects inconsistent %s across pages", async kind => {
    const first = page(0),
      second = page(1)
    if (kind === "total") second.total = 22
    if (kind === "duplicate") second.items = [session(0)]
    if (kind === "owner") second.items[0].userName = "Different"
    if (kind === "email") second.items[0].userEmail = "different@example.test"
    if (kind === "short") second.items = []
    if (kind === "current") {
      first.items[0].isCurrent = true
      second.items[0].isCurrent = true
    }
    if (kind === "page") second.page = 0
    if (kind === "size") second.size = 10
    if (kind === "order") second.items[0].startDate = new Date("2026-02-01T00:00:00Z")
    if (kind === "bound") {
      first.total = 20001
      first.totalPages = 1001
    }
    read
      .mockReturnValueOnce(of(Result.success(first)))
      .mockReturnValueOnce(of(Result.success(second)))
    const result = await firstValueFrom(TestBed.inject(GetAllUserSessionsUseCase).execute())
    expect(!result.success && result.error.code).toBe("INVALID_RESPONSE")
  })
  it("cancels an intermediate page and isolates repeated executions", async () => {
    const later = new Subject<Result<UserSessionPage, UserSessionError>>()
    read.mockReturnValueOnce(of(Result.success(page(0)))).mockReturnValueOnce(later)
    const emitted = vi.fn()
    const useCase = TestBed.inject(GetAllUserSessionsUseCase)
    const subscription = useCase.execute().subscribe(emitted)
    expect(emitted).not.toHaveBeenCalled()
    subscription.unsubscribe()
    expect(later.observed).toBe(false)
    later.next(Result.success(page(1)))
    expect(emitted).not.toHaveBeenCalled()
    const result = await firstValueFrom(useCase.execute())
    expect(result.success && result.data.items).toHaveLength(21)
  })
  it("rejects a later read that completes without a response", async () => {
    read.mockReturnValueOnce(of(Result.success(page(0)))).mockReturnValueOnce(EMPTY)
    const result = await firstValueFrom(TestBed.inject(GetAllUserSessionsUseCase).execute())
    expect(!result.success && result.error.code).toBe("INVALID_RESPONSE")
  })
  it("maps thrown failures safely", async () => {
    read.mockReturnValue(throwError(() => new Error("private")))
    const result = await firstValueFrom(TestBed.inject(GetAllUserSessionsUseCase).execute())
    expect(!result.success && result.error.code).toBe("UNEXPECTED")
  })
})
