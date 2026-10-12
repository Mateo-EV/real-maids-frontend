import { TestBed } from "@angular/core/testing"
import { EMPTY, firstValueFrom, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { UserSession } from "../../domain/entities/user-session.entity"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { UserSessionsStore } from "./user-sessions.store"

const current = () =>
  UserSession.create(
    91,
    42,
    "192.0.2.1",
    "Browser",
    new Date(Date.now() - 1000),
    new Date(Date.now() + 60000),
    true,
    "Real",
    "real@example.test"
  )
describe("UserSessionsStore", () => {
  let repository: {
    getUserSessions: ReturnType<typeof vi.fn>
    revokeUserSession: ReturnType<typeof vi.fn>
    revokeUserSessions: ReturnType<typeof vi.fn>
  }
  beforeEach(() => {
    repository = {
      getUserSessions: vi.fn(() => of(Result.success([current()]))),
      revokeUserSession: vi.fn(() => of(Result.success(undefined))),
      revokeUserSessions: vi.fn(() => of(Result.success(undefined)))
    }
    TestBed.configureTestingModule({
      providers: [{ provide: USER_SESSION_REPOSITORY, useValue: repository }]
    })
  })
  it("derives counts solely from the array and exposes no transport metadata", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadSessions())
    expect(repository.getUserSessions).toHaveBeenCalledExactlyOnceWith()
    expect(store.sessionCount()).toBe(1)
    for (const field of ["total", "page", "size", "totalPages", "query", "collectionComplete"])
      expect(store).not.toHaveProperty(field)
    expect(store.loaded()).toBe(true)
    store.sessions()[0].expiryDate = new Date(0)
    store.refreshClock()
    expect(store.sessionCount()).toBe(1)
    expect(store.activeSessions()).toEqual([])
  })
  it("guards only the actual flag, never a local credential marker", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadSessions())
    const result = await firstValueFrom(store.revokeSession(42, 91))
    expect(!result.success && result.error.code).toBe("CURRENT_SESSION")
    expect(repository.revokeUserSession).not.toHaveBeenCalled()
    await firstValueFrom(store.revokeSession(42, 92))
    expect(repository.revokeUserSession).toHaveBeenCalledExactlyOnceWith(42, 92)
  })
  it("requeries once after individual/bulk success and retains the caller's current session", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadSessions())
    await firstValueFrom(store.revokeSession(42, 92))
    await firstValueFrom(store.revokeSessions(42))
    expect(repository.getUserSessions).toHaveBeenCalledTimes(3)
    expect(repository.getUserSessions.mock.calls.every(args => args.length === 0)).toBe(true)
    expect(repository.revokeUserSessions).toHaveBeenCalledExactlyOnceWith(42)
    expect(store.sessions()[0].isCurrent).toBe(true)
  })
  it("does not optimistically delete records while an authoritative refresh is pending", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadSessions())
    const response = new Subject<Result<UserSession[], UserSessionError>>()
    repository.getUserSessions.mockReturnValue(response)
    const subscription = store.revokeSessions(42).subscribe()
    expect(store.sessions()[0].isCurrent).toBe(true)
    expect(store.loaded()).toBe(false)
    response.next(Result.success([current()]))
    response.complete()
    subscription.unsubscribe()
    expect(store.loaded()).toBe(true)
  })
  it("ignores stale success and failure without binding the root lifetime to a caller", async () => {
    const store = TestBed.inject(UserSessionsStore)
    const old = new Subject<Result<UserSession[], UserSessionError>>()
    repository.getUserSessions.mockReturnValueOnce(old)
    const subscription = store.loadSessions().subscribe()
    await firstValueFrom(store.loadSessions())
    old.next(Result.failure(new UserSessionError("NETWORK")))
    old.next(Result.success([]))
    old.complete()
    expect(store.sessions()).toHaveLength(1)
    expect(store.error()).toBeUndefined()
    expect(store.loading()).toBe(false)
    subscription.unsubscribe()
    repository.getUserSessions.mockReturnValue(new Subject())
    store.loadSessions().subscribe().unsubscribe()
    expect(store.loading()).toBe(false)
    expect(store.loaded()).toBe(false)
    repository.getUserSessions.mockReturnValue(of(Result.success([current()])))
    await firstValueFrom(store.loadSessions())
    expect(store.loaded()).toBe(true)
  })
  it("invalidates a pre-write read so it cannot resurrect closed sessions", async () => {
    const store = TestBed.inject(UserSessionsStore)
    const old = new Subject<Result<UserSession[], UserSessionError>>()
    repository.getUserSessions.mockReturnValueOnce(old)
    store.loadSessions().subscribe()
    repository.getUserSessions.mockReturnValue(of(Result.success([])))
    await firstValueFrom(store.revokeSessions(42))
    old.next(Result.success([current()]))
    old.complete()
    expect(store.sessions()).toEqual([])
    expect(store.sessionCount()).toBe(0)
  })
  it("reads an empty array once without a corrective or subsequent page request", async () => {
    repository.getUserSessions.mockReturnValue(of(Result.success([])))
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadAllSessions())
    expect(repository.getUserSessions).toHaveBeenCalledExactlyOnceWith()
    expect(store.loaded()).toBe(true)
    expect(store.sessionCount()).toBe(0)
  })
  it("keeps prior records/counts while loading or failing and supports read retry", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadAllSessions())
    const previous = store.sessions()
    const response = new Subject<Result<UserSession[], UserSessionError>>()
    repository.getUserSessions.mockReturnValue(response)
    const subscription = store.loadAllSessions().subscribe()
    expect(store.loaded()).toBe(false)
    expect(store.sessions()).toBe(previous)
    response.next(Result.failure(new UserSessionError("NETWORK")))
    response.complete()
    expect(store.error()?.code).toBe("NETWORK")
    expect(store.sessions()).toBe(previous)
    expect(store.sessionCount()).toBe(1)
    subscription.unsubscribe()
    repository.getUserSessions.mockReturnValue(of(Result.success([])))
    await firstValueFrom(store.loadAllSessions())
    expect(store.loaded()).toBe(true)
    expect(store.sessionCount()).toBe(0)
  })
  it("reports refresh failure without replaying a successful write", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadSessions())
    const previous = store.sessions()
    repository.getUserSessions.mockReturnValue(throwError(() => new Error("private")))
    const result = await firstValueFrom(store.revokeSessions(42))
    expect(result.success).toBe(true)
    expect(store.error()?.code).toBe("UNEXPECTED")
    expect(store.sessions()).toBe(previous)
    expect(repository.revokeUserSessions).toHaveBeenCalledOnce()
    repository.revokeUserSession.mockReturnValue(
      of(Result.failure(new UserSessionError("VALIDATION")))
    )
    expect((await firstValueFrom(store.revokeSession(42, 92))).success).toBe(false)
    expect(store.sessions()).toBe(previous)
  })
  it("rejects an empty observable rather than a successful empty collection", async () => {
    repository.getUserSessions.mockReturnValue(EMPTY)
    const store = TestBed.inject(UserSessionsStore)
    const result = await firstValueFrom(store.loadSessions())
    expect(!result.success && result.error.code).toBe("INVALID_RESPONSE")
    expect(store.loaded()).toBe(false)
    expect(store.loading()).toBe(false)
  })
})
