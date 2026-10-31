import { PLATFORM_ID, signal } from "@angular/core"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { TestBed } from "@angular/core/testing"
import { EMPTY, firstValueFrom, of, Subject, throwError } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
  const page = { items: [], total: 0, offset: 0, limit: 5 }
  let session = signal<AuthSession | null>(null)
  let changes: Subject<AuthSession | null>
  afterEach(() => vi.restoreAllMocks())
  beforeEach(() => {
    session = signal<AuthSession | null>(
      AuthSession.create("Test", "test@example.test", null, null, 1)
    )
    changes = new Subject<AuthSession | null>()
    repository = {
      getSessionOwners: vi.fn(() => of(Result.success(page))),
      getSessionCount: vi.fn(() => of(Result.success(1007))),
      getUserSessionsByUser: vi.fn(() => of(Result.success([current()]))),
      revokeUserSession: vi.fn(() => of(Result.success(undefined))),
      revokeUserSessions: vi.fn(() => of(Result.success(undefined)))
    }
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthStore,
          useValue: { session }
        },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
        { provide: USER_SESSION_REPOSITORY, useValue: repository }
      ]
    })
  })
  it("joins forced count/detail/owner reads and ref-counts final cancellation", () => {
    const store = TestBed.inject(UserSessionsStore)
    const count = new Subject(),
      detail = new Subject(),
      owners = new Subject()
    repository["getSessionCount"].mockReturnValue(count)
    repository["getUserSessionsByUser"].mockReturnValue(detail)
    repository["getSessionOwners"].mockReturnValue(owners)
    const a = [
      store.loadSessionCount().subscribe(),
      store.loadDetails(42).subscribe(),
      store.observeOwners({}).subscribe()
    ]
    const b = [
      store.loadSessionCount(true).subscribe(),
      store.loadDetails(42, true).subscribe(),
      store.observeOwners({}, 0, true).subscribe()
    ]
    for (const key of ["getSessionCount", "getUserSessionsByUser", "getSessionOwners"])
      expect(repository[key]).toHaveBeenCalledOnce()
    a.forEach(subscription => subscription.unsubscribe())
    for (const source of [count, detail, owners]) expect(source.observed).toBe(true)
    b.forEach(subscription => subscription.unsubscribe())
    for (const source of [count, detail, owners]) expect(source.observed).toBe(false)
    expect(store.loading()).toBe(false)
    expect(store.details()[42].loaded).toBe(false)
    expect(store.ownerEntries()).toEqual({})
  })
  it("retains verified zero/empty data during stale refresh and failed retries without renewing TTL", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    const store = TestBed.inject(UserSessionsStore)
    repository["getSessionCount"].mockReturnValue(of(Result.success(0)))
    repository["getUserSessionsByUser"].mockReturnValue(of(Result.success([])))
    store.loadSessionCount().subscribe()
    store.loadDetails(42).subscribe()
    store.observeOwners({}).subscribe().unsubscribe()
    now.mockReturnValue(121000)
    const count = new Subject(),
      detail = new Subject(),
      owners = new Subject()
    repository["getSessionCount"].mockReturnValueOnce(count)
    repository["getUserSessionsByUser"].mockReturnValueOnce(detail)
    repository["getSessionOwners"].mockReturnValueOnce(owners)
    store.loadSessionCount().subscribe()
    store.loadDetails(42).subscribe()
    const activity = store.observeOwners({}).subscribe()
    const selected = store.selectOwners(signal({}))
    expect(store.refreshing()).toBe(true)
    expect(store.details()[42]).toMatchObject({ items: [], loaded: true, refreshing: true })
    expect(selected.result()).toBe(page)
    expect(selected.refreshing()).toBe(true)
    const error = new UserSessionError("NETWORK")
    for (const source of [count, detail, owners]) {
      source.next(Result.failure(error))
      source.complete()
    }
    expect(store.sessionCount()).toBe(0)
    expect(store.loaded()).toBe(true)
    expect(store.error()).toBe(error)
    expect(store.countExpiresAt()).toBe(121000)
    expect(store.details()[42]).toMatchObject({ items: [], loaded: true, expiresAt: 121000, error })
    expect(selected.result()).toBe(page)
    expect(selected.error()).toBe(error)
    activity.unsubscribe()
    store.loadSessionCount().subscribe()
    store.loadDetails(42).subscribe()
    store.observeOwners({}).subscribe().unsubscribe()
    for (const key of ["getSessionCount", "getUserSessionsByUser", "getSessionOwners"])
      expect(repository[key]).toHaveBeenCalledTimes(3)
  })
  it.each([false, true])(
    "shares lazy mutation batches across observers with synchronous failure=%s",
    failed => {
      const store = TestBed.inject(UserSessionsStore)
      const a = store.observeOwners({}).subscribe(),
        b = store.observeOwners({}).subscribe()
      repository["getSessionOwners"].mockReturnValue(
        failed ? of(Result.failure(new UserSessionError("NETWORK"))) : of(Result.success(page))
      )
      store.refreshOwnersAfterUserMutation(1)
      store.refreshOwnersAfterUserMutation(1)
      expect(repository["getSessionOwners"]).toHaveBeenCalledTimes(2)
      store.revokeSessions(42).subscribe()
      expect(repository["getSessionOwners"]).toHaveBeenCalledTimes(3)
      expect(repository["revokeUserSessions"]).toHaveBeenCalledOnce()
      expect(repository["getSessionCount"]).not.toHaveBeenCalled()
      a.unsubscribe()
      b.unsubscribe()
    }
  )
  it("invalidates count/details once before a parent's forced refresh and preserves verified data", () => {
    const store = TestBed.inject(UserSessionsStore)
    store.loadSessionCount().subscribe()
    store.loadDetails(42).subscribe()
    store.refreshOwnersAfterUserMutation(9)
    const pending = new Subject()
    repository["getSessionCount"].mockReturnValueOnce(pending)
    store.loadSessionCount(true).subscribe()
    store.refreshOwnersAfterUserMutation(9)
    expect(pending.observed).toBe(true)
    expect(store.details()[42]).toMatchObject({ items: [current()], loaded: false, expiresAt: 0 })
    pending.next(Result.success(7))
    pending.complete()
    expect(store.sessionCount()).toBe(7)
    expect(repository["getSessionCount"]).toHaveBeenCalledTimes(2)
  })
  it("uses effective owner pagination for one clamp and subsequent invalidation", () => {
    const store = TestBed.inject(UserSessionsStore)
    repository["getSessionOwners"]
      .mockReturnValueOnce(of(Result.success({ ...page, total: 3, offset: 4, limit: 2 })))
      .mockReturnValue(of(Result.success({ ...page, total: 3, offset: 2, limit: 2 })))
    const query = signal({ offset: 10, limit: 5, hasSessions: false, search: " Ana " })
    const activity = store.observeOwners(query()).subscribe()
    const selected = store.selectOwners(query)
    expect(selected.query()).toEqual({ offset: 2, limit: 2, hasSessions: false, search: "Ana" })
    expect(repository["getSessionOwners"]).toHaveBeenCalledTimes(2)
    store.revokeSessions(42).subscribe()
    expect(repository["getSessionOwners"]).toHaveBeenLastCalledWith(selected.query())
    activity.unsubscribe()
  })
  it("bounds inactive histories while pinning owner and selected detail observers", () => {
    const store = TestBed.inject(UserSessionsStore)
    const owner = store.observeOwners({ search: "pinned" }).subscribe()
    const detail = store.observeDetails(42).subscribe()
    for (let id = 100; id < 130; id++) {
      store
        .observeOwners({ search: String(id) })
        .subscribe()
        .unsubscribe()
      store.loadDetails(id).subscribe()
    }
    expect(Object.keys(store.ownerEntries())).toHaveLength(21)
    expect(Object.keys(store.details())).toHaveLength(21)
    expect(store.details()[42].loaded).toBe(true)
    owner.unsubscribe()
    detail.unsubscribe()
    expect(Object.keys(store.ownerEntries())).toHaveLength(20)
    expect(Object.keys(store.details())).toHaveLength(20)
  })
  it.each(["logout", "expiry", "replacement"])(
    "clears and fences pending reads/writes on %s without reinserting removed keys",
    kind => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1000)
      session.set(AuthSession.create("Test", "test@example.test", null, 2000, 1))
      const store = TestBed.inject(UserSessionsStore)
      const count = new Subject(),
        detail = new Subject(),
        owners = new Subject(),
        write = new Subject()
      repository["getSessionCount"].mockReturnValue(count)
      repository["getUserSessionsByUser"].mockReturnValue(detail)
      repository["getSessionOwners"].mockReturnValue(owners)
      repository["revokeUserSessions"].mockReturnValue(write)
      const activity = store.observeOwners({}).subscribe()
      store.loadSessionCount().subscribe()
      store.loadDetails(42).subscribe()
      store.revokeSessions(42).subscribe()
      changes.next(session())
      for (const source of [count, detail, owners, write]) expect(source.observed).toBe(true)
      if (kind === "expiry") {
        now.mockReturnValue(2000)
        store.loadSessionCount().subscribe()
      } else {
        session.set(
          kind === "logout"
            ? null
            : AuthSession.create("Other", "other@example.test", null, null, 2)
        )
        changes.next(session())
      }
      for (const source of [count, detail, owners, write]) expect(source.observed).toBe(false)
      write.next(Result.success(undefined))
      count.next(Result.success(999))
      detail.next(Result.success([current()]))
      owners.next(Result.success(page))
      activity.unsubscribe()
      expect(store.ownerEntries()).toEqual({})
      expect(store.details()).toEqual({})
      expect(store.sessionCount()).toBeUndefined()
      expect(store.mutationRevision()).toBe(0)
    }
  )
  it("cancels a debounced owner read before dispatch without retaining unverified state", () => {
    vi.useFakeTimers()
    try {
      const store = TestBed.inject(UserSessionsStore)
      const selected = store.selectOwners(signal({ search: "Ana" }))
      const activity = store.observeOwners({ search: " Ana " }, 250).subscribe()
      expect(selected.loading()).toBe(true)
      vi.advanceTimersByTime(249)
      expect(repository["getSessionOwners"]).not.toHaveBeenCalled()
      activity.unsubscribe()
      vi.advanceTimersByTime(1)
      expect(repository["getSessionOwners"]).not.toHaveBeenCalled()
      expect(store.ownerEntries()).toEqual({})
    } finally {
      vi.useRealTimers()
    }
  })
  it("retains verified rows but restores the retried request query on owner failure", () => {
    const store = TestBed.inject(UserSessionsStore)
    const effective = { ...page, offset: 2, limit: 2, total: 3 }
    repository["getSessionOwners"].mockReturnValueOnce(of(Result.success(effective)))
    const query = signal({ offset: 5, limit: 5 })
    store.observeOwners(query()).subscribe().unsubscribe()
    repository["getSessionOwners"].mockReturnValueOnce(throwError(() => Error("private")))
    const activity = store.observeOwners(query(), 0, true).subscribe()
    const selected = store.selectOwners(query)
    expect(selected.result()).toBe(effective)
    expect(selected.query()).toEqual(query())
    expect(selected.loaded()).toBe(true)
    expect(selected.error()?.code).toBe("UNEXPECTED")
    activity.unsubscribe()
  })
  it.each([EMPTY, throwError(() => new UserSessionError("NETWORK"))])(
    "normalizes owner empty/thrown streams without fabricating verified results",
    response => {
      const store = TestBed.inject(UserSessionsStore)
      repository["getSessionOwners"].mockReturnValueOnce(response)
      const selected = store.selectOwners(signal({}))
      const activity = store.observeOwners({}).subscribe()
      expect(selected.loaded()).toBe(false)
      expect(selected.loading()).toBe(false)
      expect(selected.error()?.code).toBe(response === EMPTY ? "INVALID_RESPONSE" : "NETWORK")
      expect(selected.result()).toBeUndefined()
      activity.unsubscribe()
    }
  )
  it("refreshes affected count/open detail once through consumer reads without replaying the write", () => {
    const store = TestBed.inject(UserSessionsStore)
    const activity = store.observeOwners({}).subscribe()
    const open = store.observeDetails(42).subscribe()
    store.loadSessionCount().subscribe()
    store.revokeSession(42, 92).subscribe()
    repository["getSessionCount"].mockReturnValueOnce(
      of(Result.failure(new UserSessionError("NETWORK")))
    )
    repository["getUserSessionsByUser"].mockReturnValueOnce(of(Result.success([])))
    store.loadSessionCount(true).subscribe()
    store.loadDetails(42, true).subscribe()
    expect(repository["getSessionOwners"]).toHaveBeenCalledTimes(2)
    expect(repository["getSessionCount"]).toHaveBeenCalledTimes(2)
    expect(repository["getUserSessionsByUser"]).toHaveBeenCalledTimes(2)
    expect(repository["revokeUserSession"]).toHaveBeenCalledOnce()
    expect(store.sessionCount()).toBe(1007)
    expect(store.error()?.code).toBe("NETWORK")
    expect(store.details()[42]).toMatchObject({ items: [], loaded: true })
    activity.unsubscribe()
    open.unsubscribe()
  })
  it("dispatches no SSR reads", () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    const store = TestBed.inject(UserSessionsStore)
    store.observeOwners({}).subscribe().unsubscribe()
    store.loadSessionCount().subscribe()
    store.loadDetails(42).subscribe()
    for (const key of ["getSessionCount", "getUserSessionsByUser", "getSessionOwners"])
      expect(repository[key]).not.toHaveBeenCalled()
    expect(store.ownerEntries()).toEqual({})
    expect(store.details()).toEqual({})
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
