import { signal } from "@angular/core"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
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
    new Date(0),
    new Date(60000),
    true,
    "Real",
    "real@example.test"
  )
describe("UserSessionsStore", () => {
  let repository: Record<string, ReturnType<typeof vi.fn>>
  beforeEach(() => {
    repository = {
      getSessionCount: vi.fn(() => of(Result.success(1007))),
      getUserSessionsByUser: vi.fn(() => of(Result.success([current()]))),
      revokeUserSession: vi.fn(() => of(Result.success(undefined))),
      revokeUserSessions: vi.fn(() => of(Result.success(undefined)))
    }
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthStore,
          useValue: {
            session: signal(AuthSession.create("Test", "test@example.test", null, null, 1))
          }
        },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
        { provide: USER_SESSION_REPOSITORY, useValue: repository }
      ]
    })
  })
  it("loads exact global count independently of detail, owners and clock", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadSessionCount())
    expect(store.sessionCount()).toBe(1007)
    expect(repository["getUserSessionsByUser"]).not.toHaveBeenCalled()
    await firstValueFrom(store.loadDetails(42))
    expect(store.sessionCount()).toBe(1007)
    expect(store.details()[42].items[0].isCurrent).toBe(true)
  })
  it("guards current actual and notifies writes once without starting orphan refreshes", async () => {
    const store = TestBed.inject(UserSessionsStore)
    await firstValueFrom(store.loadDetails(42))
    const result = await firstValueFrom(store.revokeSession(42, 91))
    expect(!result.success && result.error.code).toBe("CURRENT_SESSION")
    expect(repository["revokeUserSession"]).not.toHaveBeenCalled()
    await firstValueFrom(store.revokeSession(42, 92))
    expect(store.mutationRevision()).toBe(1)
    expect(store.affectedUserId()).toBe(42)
    await firstValueFrom(store.revokeSessions(42))
    expect(store.mutationRevision()).toBe(2)
    expect(repository["getSessionCount"]).not.toHaveBeenCalled()
    expect(repository["getUserSessionsByUser"]).toHaveBeenCalledOnce()
    // Bulk delegates without deleting the caller's retained current session.
    expect(store.details()[42].items[0].isCurrent).toBe(true)
    expect(store.details()[42].loaded).toBe(false)
  })
  it("shares same-ID requests independently and leaves final cancellation unverified", async () => {
    const store = TestBed.inject(UserSessionsStore)
    const old = new Subject(),
      other = new Subject()
    repository["getUserSessionsByUser"].mockReturnValueOnce(old).mockReturnValueOnce(other)
    store.loadDetails(42).subscribe()
    const subscription = store.loadDetails(43).subscribe()
    const shared = firstValueFrom(store.loadDetails(42))
    expect(old.observed).toBe(true)
    expect(other.observed).toBe(true)
    old.next(Result.success([current()]))
    old.complete()
    await shared
    expect(repository["getUserSessionsByUser"]).toHaveBeenCalledTimes(2)
    expect(store.details()[42].items).toHaveLength(1)
    subscription.unsubscribe()
    expect(other.observed).toBe(false)
    expect(store.details()[43].loaded).toBe(false)
    expect(store.details()[43].loading).toBe(false)
  })
  it("preserves write success when independent refresh fails; retry never replays writes", async () => {
    const store = TestBed.inject(UserSessionsStore)
    expect((await firstValueFrom(store.revokeSessions(42))).success).toBe(true)
    repository["getSessionCount"].mockReturnValue(throwError(() => Error("private")))
    await firstValueFrom(store.loadSessionCount())
    expect(store.error()?.code).toBe("UNEXPECTED")
    expect(store.loaded()).toBe(false)
    repository["getUserSessionsByUser"].mockReturnValue(
      of(Result.failure(new UserSessionError("FORBIDDEN")))
    )
    await firstValueFrom(store.loadDetails(42))
    expect(store.details()[42].error?.code).toBe("FORBIDDEN")
    expect(store.details()[42].loaded).toBe(false)
    expect(repository["revokeUserSessions"]).toHaveBeenCalledOnce()
  })
  it("invalidates pre-write count/detail reads so late results cannot resurrect confirmed state", async () => {
    const store = TestBed.inject(UserSessionsStore)
    const count = new Subject(),
      detail = new Subject()
    repository["getSessionCount"].mockReturnValueOnce(count)
    repository["getUserSessionsByUser"].mockReturnValueOnce(detail)
    store.loadSessionCount().subscribe()
    store.loadDetails(42).subscribe()
    await firstValueFrom(store.revokeSessions(42))
    expect(count.observed).toBe(false)
    expect(detail.observed).toBe(false)
    count.next(Result.success(9000))
    detail.next(Result.success([current()]))
    expect(store.loaded()).toBe(false)
    expect(store.details()[42].loaded).toBe(false)
    await firstValueFrom(store.loadSessionCount())
    await firstValueFrom(store.loadDetails(42))
    expect(store.sessionCount()).toBe(1007)
    expect(store.details()[42].loaded).toBe(true)
  })
  it("does not notify failed writes, and rejects empty count/detail streams", async () => {
    const store = TestBed.inject(UserSessionsStore)
    repository["revokeUserSession"].mockReturnValue(
      of(Result.failure(new UserSessionError("FORBIDDEN")))
    )
    await firstValueFrom(store.revokeSession(42, 92))
    expect(store.mutationRevision()).toBe(0)
    repository["getSessionCount"].mockReturnValue(EMPTY)
    repository["getUserSessionsByUser"].mockReturnValue(EMPTY)
    await firstValueFrom(store.loadSessionCount())
    await firstValueFrom(store.loadDetails(42))
    expect(store.error()?.code).toBe("INVALID_RESPONSE")
    expect(store.details()[42].error?.code).toBe("INVALID_RESPONSE")
  })
})
