import { PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, EMPTY, Observable, of, Subject, throwError } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AUTH_REPOSITORY } from "@/app/features/auth/domain/repositories/auth.repository"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { UserSessionOwner } from "../../domain/models/user-session-owner"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { UserSessionsStore } from "./user-sessions.store"

type OwnersResult = Result<PaginationResponse<UserSessionOwner>, UserSessionError>
const identity = () => AuthSession.create("Test", "test@example.test", null, null, 1)
const page = {
  items: [{ id: 42, name: "Ana", email: "ana@example.test", sessionCount: 9 }],
  total: 1,
  offset: 0,
  limit: 5
}
function setup() {
  const session = signal<AuthSession | null>(identity())
  const changes = new Subject<AuthSession | null>()
  const repository = {
    getSessionOwners: vi.fn((): Observable<OwnersResult> => of(Result.success(page))),
    getSessionCount: vi.fn(() => of(Result.success(1007))),
    getUserSessionsByUser: vi.fn(() => of(Result.success([]))),
    revokeUserSession: vi.fn((): Observable<Result<void, UserSessionError>> =>
      of(Result.success(undefined))
    ),
    revokeUserSessions: vi.fn(() => of(Result.success(undefined)))
  }
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthStore, useValue: { session } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
      { provide: USER_SESSION_REPOSITORY, useValue: repository }
    ]
  })
  return { store: TestBed.inject(UserSessionsStore), session, changes, repository }
}
describe("root-owned session owner queries", () => {
  afterEach(() => vi.useRealTimers())
  it("publishes server owner results through the root readonly selector, without count or detail reads", () => {
    const { store, repository } = setup()
    const query = signal({ offset: 0, limit: 5 })
    const owners = store.selectOwners(query)
    const subscription = store.observeOwners(query()).subscribe()
    expect(owners.result()).toBe(page)
    expect(owners.loaded()).toBe(true)
    expect(owners.query()).toEqual(query())
    expect(repository.getSessionOwners).toHaveBeenCalledExactlyOnceWith(query())
    expect(repository.getSessionCount).not.toHaveBeenCalled()
    expect(repository.getUserSessionsByUser).not.toHaveBeenCalled()
    subscription.unsubscribe()
    expect(owners.result()).toBe(page)
  })
  it("normalizes full keys, shares same-key results/status and keeps different queries independent", () => {
    const { store, repository } = setup()
    const a = new Subject<OwnersResult>(),
      b = new Subject<OwnersResult>()
    repository.getSessionOwners.mockReturnValueOnce(a).mockReturnValueOnce(b)
    const query = signal({ search: " Ana ", hasSessions: false })
    const first = store.selectOwners(query),
      same = store.selectOwners(signal({ offset: 0, limit: 5, search: "Ana", hasSessions: false }))
    const other = store.selectOwners(signal({ search: "Other" }))
    const one = store.observeOwners(query()).subscribe()
    const two = store.observeOwners({ search: "Ana", hasSessions: false }).subscribe()
    const three = store.observeOwners({ search: "Other" }).subscribe()
    expect(repository.getSessionOwners).toHaveBeenCalledTimes(2)
    expect(first.loading()).toBe(true)
    expect(same.loading()).toBe(true)
    a.next(Result.success(page))
    a.complete()
    expect(first.result()).toBe(same.result())
    expect(first.loaded()).toBe(true)
    expect(other.loading()).toBe(true)
    b.next(Result.failure(new UserSessionError("FORBIDDEN")))
    b.complete()
    expect(other.error()?.code).toBe("FORBIDDEN")
    expect(first.error()).toBeUndefined()
    one.unsubscribe()
    two.unsubscribe()
    three.unsubscribe()
    expect(Object.keys(store.ownerEntries())).toHaveLength(1)
  })
  it("keeps a shared flight alive when one consumer switches or cancels, and disposes only inactive entries", () => {
    const { store, repository } = setup()
    const pending = new Subject<OwnersResult>(),
      other = new Subject<OwnersResult>()
    repository.getSessionOwners.mockReturnValueOnce(pending).mockReturnValueOnce(other)
    const first = store.observeOwners({}).subscribe()
    const second = store.observeOwners({}).subscribe()
    const selected = store.selectOwners(signal({}))
    first.unsubscribe()
    const switched = store.observeOwners({ search: "Other" }).subscribe()
    expect(pending.observed).toBe(true)
    expect(selected.loading()).toBe(true)
    pending.next(Result.success(page))
    pending.complete()
    expect(selected.result()).toBe(page)
    switched.unsubscribe()
    expect(other.observed).toBe(false)
    expect(Object.keys(store.ownerEntries())).toHaveLength(1)
    second.unsubscribe()
    expect(selected.result()).toBe(page)
    for (let i = 0; i < 30; i++)
      store
        .observeOwners({ search: String(i) })
        .subscribe()
        .unsubscribe()
    expect(Object.keys(store.ownerEntries())).toHaveLength(20)
  })
  it("reads expired activity without polling and reuses renewed results", () => {
    vi.useFakeTimers()
    const { store, repository } = setup()
    const first = store.observeOwners({}).subscribe()
    vi.advanceTimersByTime(120000)
    expect(repository.getSessionOwners).toHaveBeenCalledOnce()
    const second = store.observeOwners({}).subscribe()
    expect(repository.getSessionOwners).toHaveBeenCalledTimes(2)
    first.unsubscribe()
    second.unsubscribe()
    store.observeOwners({}).subscribe().unsubscribe()
    expect(repository.getSessionOwners).toHaveBeenCalledTimes(2)
  })
  it.each([
    [EMPTY, "INVALID_RESPONSE"],
    [throwError(() => Error("private")), "UNEXPECTED"],
    [throwError(() => new UserSessionError("NETWORK")), "NETWORK"]
  ] as const)(
    "settles empty/thrown owner failures and independently retries verified empty results",
    (response, code) => {
      const { store, repository } = setup()
      repository.getSessionOwners.mockReturnValueOnce(response)
      const selected = store.selectOwners(signal({}))
      const first = store.observeOwners({}).subscribe()
      expect(selected.loading()).toBe(false)
      expect(selected.loaded()).toBe(false)
      expect(selected.error()?.code).toBe(code)
      first.unsubscribe()
      repository.getSessionOwners.mockReturnValueOnce(
        of(Result.success({ ...page, items: [], total: 0 }))
      )
      const retry = store.observeOwners({}).subscribe()
      expect(selected.loaded()).toBe(true)
      expect(selected.result()?.total).toBe(0)
      expect(selected.error()).toBeUndefined()
      expect(repository.getSessionCount).not.toHaveBeenCalled()
      expect(repository.getUserSessionsByUser).not.toHaveBeenCalled()
      retry.unsubscribe()
    }
  )
  it("debounces cancelably without an orphan timer or read", () => {
    vi.useFakeTimers()
    const { store, repository } = setup()
    const selected = store.selectOwners(signal({}))
    const subscription = store.observeOwners({}, 250).subscribe()
    expect(selected.loading()).toBe(true)
    vi.advanceTimersByTime(249)
    expect(repository.getSessionOwners).not.toHaveBeenCalled()
    subscription.unsubscribe()
    vi.advanceTimersByTime(1)
    expect(repository.getSessionOwners).not.toHaveBeenCalled()
    expect(selected.loading()).toBe(false)
    expect(store.ownerEntries()).toEqual({})
  })
  it.each(["logout", "expiry", "replacement"])(
    "clears %s data and fences prior owner/count/detail/mutation completions",
    kind => {
      vi.useFakeTimers()
      vi.setSystemTime(1000)
      const { store, repository, session, changes } = setup()
      session.set(AuthSession.create("Test", "test@example.test", null, 2000, 1))
      const selected = store.selectOwners(signal({}))
      const activity = store.observeOwners({}).subscribe()
      expect(selected.result()).toBe(page)
      store.loadSessionCount().subscribe()
      store.loadDetails(42).subscribe()
      const pending = new Subject<OwnersResult>(),
        count = new Subject(),
        detail = new Subject(),
        write = new Subject<Result<void, UserSessionError>>()
      repository.getSessionOwners.mockReturnValueOnce(pending)
      repository.getSessionCount.mockReturnValueOnce(count as never)
      repository.getUserSessionsByUser.mockReturnValueOnce(detail as never)
      repository.revokeUserSession.mockReturnValueOnce(write)
      const refreshing = store.observeOwners({}, 0, true).subscribe()
      store.loadSessionCount(true).subscribe()
      store.loadDetails(42, true).subscribe()
      store.revokeSession(42, 91).subscribe()
      if (kind === "expiry") {
        vi.setSystemTime(2000)
        store.observeOwners({}).subscribe().unsubscribe()
      } else {
        session.set(
          kind === "logout"
            ? null
            : AuthSession.create("Other", "other@example.test", null, null, 2)
        )
        changes.next(session())
      }
      expect(pending.observed).toBe(false)
      expect(count.observed).toBe(false)
      expect(detail.observed).toBe(false)
      expect(write.observed).toBe(false)
      pending.next(Result.success(page))
      count.next(Result.success(999))
      detail.next(Result.success([]))
      write.next(Result.success(undefined))
      expect(selected.result()).toBeUndefined()
      expect(selected.loading()).toBe(false)
      expect(store.ownerEntries()).toEqual({})
      expect(store.details()).toEqual({})
      expect(store.sessionCount()).toBeUndefined()
      expect(store.mutationRevision()).toBe(0)
      activity.unsubscribe()
      refreshing.unsubscribe()
    }
  )
  it("keeps pending and loaded owner state across same-session credential publication", () => {
    const { store, repository, session, changes } = setup()
    const pending = new Subject<OwnersResult>()
    repository.getSessionOwners.mockReturnValueOnce(pending)
    const selected = store.selectOwners(signal({}))
    const subscription = store.observeOwners({}).subscribe()
    session.set(identity())
    changes.next(session())
    expect(pending.observed).toBe(true)
    expect(selected.loading()).toBe(true)
    pending.next(Result.success(page))
    pending.complete()
    changes.next(identity())
    expect(selected.result()).toBe(page)
    expect(repository.getSessionOwners).toHaveBeenCalledOnce()
    subscription.unsubscribe()
  })
  it("invalidates pre-write owner reads and shares one refresh across active consumers without orphan reads", () => {
    const { store, repository } = setup()
    const pending = new Subject<OwnersResult>()
    repository.getSessionOwners.mockReturnValueOnce(pending)
    const selected = store.selectOwners(signal({}))
    const subscription = store.observeOwners({}).subscribe()
    const second = store.observeOwners({}).subscribe()
    store.revokeSessions(42).subscribe()
    expect(pending.observed).toBe(false)
    pending.next(Result.success({ ...page, total: 999 }))
    expect(selected.result()).toBe(page)
    expect(repository.getSessionOwners).toHaveBeenCalledTimes(2)
    expect(repository.getSessionCount).not.toHaveBeenCalled()
    expect(repository.revokeUserSessions).toHaveBeenCalledOnce()
    store.refreshOwnersAfterUserMutation(1)
    store.refreshOwnersAfterUserMutation(1)
    expect(repository.getSessionOwners).toHaveBeenCalledTimes(3)
    subscription.unsubscribe()
    second.unsubscribe()
    store.revokeSessions(42).subscribe()
    expect(repository.getSessionOwners).toHaveBeenCalledTimes(3)
    expect(repository.revokeUserSessions).toHaveBeenCalledTimes(2)
  })
  it("refreshes with effective metadata while keeping the requested selector identity and disposing its entry", () => {
    const { store, repository } = setup()
    repository.getSessionOwners.mockReturnValue(
      of(Result.success({ ...page, offset: 2, limit: 2, total: 3 }))
    )
    const query = signal({ offset: 5, limit: 5, hasSessions: false })
    const selected = store.selectOwners(query)
    const activity = store.observeOwners(query()).subscribe()
    expect(selected.query()).toEqual({ offset: 2, limit: 2, hasSessions: false })
    store.revokeSessions(42).subscribe()
    expect(repository.getSessionOwners).toHaveBeenLastCalledWith({
      offset: 2,
      limit: 2,
      hasSessions: false
    })
    expect(selected.loaded()).toBe(true)
    expect(Object.keys(store.ownerEntries())).toHaveLength(1)
    activity.unsubscribe()
    expect(Object.keys(store.ownerEntries())).toHaveLength(1)
  })

  it("dispatches no owner/count/detail reads or auth acquisition during SSR", () => {
    const repository = {
      getSessionOwners: vi.fn(),
      getSessionCount: vi.fn(),
      getUserSessionsByUser: vi.fn()
    }
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: "server" },
        { provide: USER_SESSION_REPOSITORY, useValue: repository }
      ]
    })
    const store = TestBed.inject(UserSessionsStore)
    store.observeOwners({}).subscribe().unsubscribe()
    store.loadSessionCount().subscribe()
    store.loadDetails(42).subscribe()
    for (const read of Object.values(repository)) expect(read).not.toHaveBeenCalled()
    expect(store.ownerEntries()).toEqual({})
  })
  it("acquires actual AuthStore first so source publication cannot be mistaken for a stale store snapshot", () => {
    const changes = new BehaviorSubject<AuthSession | null>(identity())
    const pending = new Subject<OwnersResult>()
    const getSessionOwners = vi.fn(() => pending)
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AUTH_REPOSITORY,
          useValue: {
            sessionChanges: () => changes,
            invalidate: () => changes.next(null),
            logout: () => changes.next(null)
          }
        },
        { provide: USER_SESSION_REPOSITORY, useValue: { getSessionOwners } }
      ]
    })
    const store = TestBed.inject(UserSessionsStore)
    const selected = store.selectOwners(signal({}))
    const subscription = store.observeOwners({}).subscribe()
    expect(TestBed.inject(AuthStore).session()?.id).toBe(1)
    changes.next(AuthSession.create("Other", "other@example.test", null, null, 2))
    expect(TestBed.inject(AuthStore).session()?.id).toBe(2)
    expect(pending.observed).toBe(false)
    pending.next(Result.success(page))
    expect(selected.result()).toBeUndefined()
    const next = store.observeOwners({}).subscribe()
    pending.next(Result.success(page))
    expect(selected.result()).toBe(page)
    TestBed.inject(AuthStore).logout()
    expect(selected.result()).toBeUndefined()
    expect(pending.observed).toBe(false)
    subscription.unsubscribe()
    next.unsubscribe()
  })
})
