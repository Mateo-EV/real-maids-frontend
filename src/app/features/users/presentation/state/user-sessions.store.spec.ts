import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { UserSession } from "../../domain/entities/user-session.entity"
import { UserSessionPage } from "../../domain/models/user-session-page"
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
const page = (items = [current()], overrides = {}): UserSessionPage => ({
  items,
  page: 0,
  size: 20,
  total: items.length,
  totalPages: items.length ? 1 : 0,
  ...overrides
})
describe("UserSessionsStore", () => {
  let repository: {
    getUserSessions: ReturnType<typeof vi.fn>
    revokeUserSession: ReturnType<typeof vi.fn>
    revokeUserSessions: ReturnType<typeof vi.fn>
  }
  beforeEach(() => {
    repository = {
      getUserSessions: vi.fn(() => of(Result.success(page()))),
      revokeUserSession: vi.fn(() => of(Result.success(undefined))),
      revokeUserSessions: vi.fn(() => of(Result.success(undefined)))
    }
    TestBed.configureTestingModule({
      providers: [{ provide: USER_SESSION_REPOSITORY, useValue: repository }]
    })
  })
  it("uses real totals independent of loaded users/rows and passes the query", async () => {
    repository.getUserSessions.mockReturnValue(
      of(Result.success(page([current()], { size: 1, total: 25, totalPages: 25 })))
    )
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadSessions({ userId: 42, size: 1 }))
    expect(repository.getUserSessions).toHaveBeenCalledWith({ userId: 42, size: 1 })
    expect(store.sessionCount()).toBe(25)
    expect(store.sessions()).toHaveLength(1)
    expect(store.loaded()).toBe(true)
  })
  it("guards only the real actual flag, never a local auth credential marker", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadSessions())
    const result = await firstValueFrom(store.revokeSession(42, 91))
    expect(!result.success && result.error.code).toBe("CURRENT_SESSION")
    expect(repository.revokeUserSession).not.toHaveBeenCalled()
    await firstValueFrom(store.revokeSession(42, 92))
    expect(repository.revokeUserSession).toHaveBeenCalledWith(42, 92)
  })
  it("requeries after individual/bulk success and retains the caller's current session", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadSessions())
    await firstValueFrom(store.revokeSession(42, 92))
    await firstValueFrom(store.revokeSessions(42))
    expect(repository.getUserSessions).toHaveBeenCalledTimes(3)
    expect(repository.revokeUserSessions).toHaveBeenCalledExactlyOnceWith(42)
    expect(store.sessions()[0].isCurrent).toBe(true)
  })
  it("does not optimistically delete records while an authoritative refresh is pending", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadSessions())
    const response = new Subject<Result<UserSessionPage, UserSessionError>>()
    repository.getUserSessions.mockReturnValue(response)
    const subscription = store.revokeSessions(42).subscribe()
    expect(store.sessions()[0].isCurrent).toBe(true)
    response.next(Result.success(page()))
    response.complete()
    subscription.unsubscribe()
    expect(store.sessions()[0].isCurrent).toBe(true)
  })
  it("ignores stale responses and cancels without binding root lifetime to the caller", async () => {
    const store = TestBed.inject(UserSessionsStore)
    const old = new Subject<Result<UserSessionPage, UserSessionError>>()
    repository.getUserSessions.mockReturnValueOnce(old)
    const subscription = store.loadSessions().subscribe()
    await firstValueFrom(store.loadSessions({ page: 0, userId: 42 }))
    old.next(Result.success(page([], { total: 0 })))
    old.complete()
    expect(store.sessions()).toHaveLength(1)
    expect(store.loading()).toBe(false)
    subscription.unsubscribe()
    repository.getUserSessions.mockReturnValue(new Subject())
    store.loadSessions().subscribe().unsubscribe()
    expect(store.loading()).toBe(false)
    repository.getUserSessions.mockReturnValue(of(Result.success(page())))
    await firstValueFrom(store.loadSessions())
    expect(store.loaded()).toBe(true)
  })
  it("invalidates a pre-write query so it cannot resurrect closed sessions", async () => {
    const store = TestBed.inject(UserSessionsStore)
    const old = new Subject<Result<UserSessionPage, UserSessionError>>()
    repository.getUserSessions.mockReturnValueOnce(old)
    store.loadSessions().subscribe()
    repository.getUserSessions.mockReturnValue(of(Result.success(page([]))))
    await firstValueFrom(store.revokeSessions(42))
    old.next(Result.success(page()))
    old.complete()
    expect(store.sessions()).toHaveLength(0)
  })
  it("corrects an empty out-of-range page with one server requery", async () => {
    repository.getUserSessions
      .mockReturnValueOnce(of(Result.success(page([], { page: 3, total: 40, totalPages: 2 }))))
      .mockReturnValueOnce(
        of(Result.success(page([current()], { page: 1, total: 21, totalPages: 2 })))
      )
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadSessions({ page: 3 }))
    expect(repository.getUserSessions).toHaveBeenLastCalledWith({ page: 1 })
    expect(store.page()).toBe(1)
  })
  it("publishes all pages atomically and never treats an intermediate failure as verified zero", async () => {
    const initial = page()
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadAllSessions())
    expect(store.collectionComplete()).toBe(true)
    const later = new Subject<Result<UserSessionPage, UserSessionError>>()
    const many = Array.from({ length: 20 }, (_, i) => ({ ...current(), id: i, isCurrent: i === 0 }))
    // Equal timestamps keep the snapshot's ordering stable.
    many.forEach(s => (s.startDate = new Date("2026-01-01T00:00:00Z")))
    repository.getUserSessions
      .mockReturnValueOnce(of(Result.success(page(many, { total: 21, totalPages: 2 }))))
      .mockReturnValueOnce(later)
    const previous = store.sessions()
    const subscription = store.loadAllSessions().subscribe()
    expect(store.collectionComplete()).toBe(false)
    expect(store.sessions()).toBe(previous)
    expect(store.sessionCount()).toBe(initial.total)
    later.next(Result.failure(new UserSessionError("NETWORK")))
    later.complete()
    expect(store.error()?.code).toBe("NETWORK")
    expect(store.sessions()).toBe(previous)
    expect(store.collectionComplete()).toBe(false)
    subscription.unsubscribe()
    repository.getUserSessions.mockReturnValue(of(Result.success(page([]))))
    await firstValueFrom(store.loadAllSessions())
    expect(store.collectionComplete()).toBe(true)
    expect(store.sessionCount()).toBe(0)
  })
  it("ignores stale collection completions and keeps collection reload mode after revoke", async () => {
    const store = TestBed.inject(UserSessionsStore)
    const old = new Subject<Result<UserSessionPage, UserSessionError>>()
    repository.getUserSessions.mockReturnValueOnce(old)
    const subscription = store.loadAllSessions().subscribe()
    await firstValueFrom(store.loadAllSessions())
    old.next(Result.success(page([])))
    old.complete()
    expect(store.sessions()).toHaveLength(1)
    subscription.unsubscribe()
    repository.getUserSessions.mockReturnValue(of(Result.failure(new UserSessionError("NETWORK"))))
    const result = await firstValueFrom(store.revokeSession(42, 92))
    expect(result.success).toBe(true)
    expect(repository.revokeUserSession).toHaveBeenCalledOnce()
    expect(repository.getUserSessions).toHaveBeenLastCalledWith({ page: 0, size: 20 })
    expect(store.error()?.code).toBe("NETWORK")
    expect(store.collectionComplete()).toBe(false)
    expect(store.sessionCount()).toBe(1)
    repository.getUserSessions.mockReturnValue(new Subject())
    store.loadAllSessions().subscribe().unsubscribe()
    expect(store.loading()).toBe(false)
    expect(store.collectionComplete()).toBe(false)
  })
  it("preserves data on failures and reports a refresh error without replaying the successful write", async () => {
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
})
