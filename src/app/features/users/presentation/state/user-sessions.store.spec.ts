import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, Subject, throwError } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { UserSession } from "../../domain/entities/user-session.entity"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { UserSessionRepositoryImpl } from "../../infrastructure/repositories/user-session.repository-impl"
import { GetUserSessionsUseCase } from "../../application/use-cases/get-user-sessions.use-case"
import { RevokeUserSessionUseCase } from "../../application/use-cases/revoke-user-session.use-case"
import { UserSessionsStore } from "./user-sessions.store"

describe("UserSessionsStore", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    TestBed.configureTestingModule({
      providers: [{ provide: USER_SESSION_REPOSITORY, useExisting: UserSessionRepositoryImpl }]
    })
  })
  afterEach(() => vi.useRealTimers())
  async function finish<T>(promise: Promise<T>) {
    await vi.advanceTimersByTimeAsync(250)
    return promise
  }
  it("loads, updates after revoke and consistently excludes expiry", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await finish(firstValueFrom(store.loadSessions()))
    expect(store.loaded()).toBe(true)
    expect(store.activeSessions()).toHaveLength(6)
    await finish(firstValueFrom(store.revokeSession(1, 2)))
    expect(store.activeSessions()).toHaveLength(5)
    const expiry = Math.max(...store.sessions().map(session => session.expiryDate.getTime()))
    vi.setSystemTime(expiry)
    store.refreshClock()
    expect(store.activeSessions()).toHaveLength(0)
  })
  it("preserves data on typed and unexpected query/revoke errors", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await finish(firstValueFrom(store.loadSessions()))
    const previous = store.sessions()
    vi.spyOn(TestBed.inject(GetUserSessionsUseCase), "execute").mockReturnValue(
      throwError(() => new Error("failure"))
    )
    const query = await firstValueFrom(store.loadSessions())
    expect(query.success).toBe(false)
    expect(store.error()?.code).toBe("UNEXPECTED")
    expect(store.sessions()).toBe(previous)
    vi.spyOn(TestBed.inject(RevokeUserSessionUseCase), "execute").mockReturnValue(
      of(Result.failure(new UserSessionError("CURRENT_SESSION")))
    )
    const revoke = await firstValueFrom(store.revokeSession(1, 1))
    expect(revoke.success).toBe(false)
    expect(store.sessions()).toBe(previous)
  })
  it("cancels loads without changing data or coupling root lifetime to callers", async () => {
    const store = TestBed.inject(UserSessionsStore)
    store.loadSessions().subscribe().unsubscribe()
    await vi.advanceTimersByTimeAsync(250)
    expect(store.loading()).toBe(false)
    expect(store.loaded()).toBe(false)
    await finish(firstValueFrom(store.loadSessions()))
    store.revokeSession(1, 2).subscribe().unsubscribe()
    await vi.advanceTimersByTimeAsync(250)
    expect(store.activeSessions().some(session => session.id === 2)).toBe(true)
  })
  it("does not resurrect a revoked record through a stale query", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await finish(firstValueFrom(store.loadSessions()))
    const old = store.sessions()
    const response = new Subject<Result<UserSession[], UserSessionError>>()
    vi.spyOn(TestBed.inject(GetUserSessionsUseCase), "execute").mockReturnValue(response)
    store.loadSessions().subscribe()
    await finish(firstValueFrom(store.revokeSession(1, 2)))
    response.next(Result.success(old))
    response.complete()
    expect(store.sessions().some(session => session.id === 2)).toBe(false)
    expect(store.loading()).toBe(false)
  })
})
