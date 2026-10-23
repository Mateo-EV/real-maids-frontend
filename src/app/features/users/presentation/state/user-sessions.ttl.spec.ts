import { PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { EMPTY, Observable, of, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { USER_SESSION_REPOSITORY } from "../../domain/repositories/user-session.repository"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { UserSessionsStore } from "./user-sessions.store"
import { UserSession } from "../../domain/entities/user-session.entity"

const page = { items: [], total: 0, offset: 0, limit: 5 }
function setup(server = false) {
  vi.useFakeTimers()
  vi.setSystemTime(1000)
  const session = signal<AuthSession | null>(
    AuthSession.create("Test", "test@example.test", null, null, 1)
  )
  const changes = new Subject<AuthSession | null>()
  const repository = {
    getSessionOwners: vi.fn((): Observable<Result<typeof page, UserSessionError>> =>
      of(Result.success(page))
    ),
    getSessionCount: vi.fn((): Observable<Result<number, UserSessionError>> =>
      of(Result.success(0))
    ),
    getUserSessionsByUser: vi.fn((): Observable<Result<UserSession[], UserSessionError>> =>
      of(Result.success([]))
    ),
    revokeUserSession: vi.fn(() => of(Result.success(undefined))),
    revokeUserSessions: vi.fn(() => of(Result.success(undefined)))
  }
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: server ? "server" : "browser" },
      { provide: AuthStore, useValue: { session } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
      { provide: USER_SESSION_REPOSITORY, useValue: repository }
    ]
  })
  return { store: TestBed.inject(UserSessionsStore), repository, session, changes }
}
describe("session capability TTL", () => {
  afterEach(() => vi.useRealTimers())
  it("reuses verified zero owner/count/details reads across revisits before the exact boundary", () => {
    const { store, repository } = setup()
    const read = () => {
      store.observeOwners({}).subscribe().unsubscribe()
      store.loadSessionCount().subscribe()
      store.loadDetails(42).subscribe()
    }
    read()
    vi.advanceTimersByTime(119999)
    read()
    expect(repository.getSessionOwners).toHaveBeenCalledOnce()
    expect(repository.getSessionCount).toHaveBeenCalledOnce()
    expect(repository.getUserSessionsByUser).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1)
    expect(repository.getSessionOwners).toHaveBeenCalledOnce() // No polling.
    read()
    expect(repository.getSessionOwners).toHaveBeenCalledTimes(2)
    expect(repository.getSessionCount).toHaveBeenCalledTimes(2)
    expect(repository.getUserSessionsByUser).toHaveBeenCalledTimes(2)
  })
  it("preserves matching stale values on failure and only success renews freshness", () => {
    const { store, repository } = setup()
    const selected = store.selectOwners(signal({}))
    store.observeOwners({}).subscribe().unsubscribe()
    store.loadSessionCount().subscribe()
    store.loadDetails(42).subscribe()
    vi.advanceTimersByTime(120000)
    const owners = new Subject<Result<typeof page, UserSessionError>>()
    const count = new Subject<Result<number, UserSessionError>>()
    const detail = new Subject<Result<UserSession[], UserSessionError>>()
    repository.getSessionOwners.mockReturnValueOnce(owners)
    repository.getSessionCount.mockReturnValueOnce(count)
    repository.getUserSessionsByUser.mockReturnValueOnce(detail)
    const activity = store.observeOwners({}).subscribe()
    store.loadSessionCount().subscribe()
    store.loadDetails(42).subscribe()
    expect(selected.result()).toBe(page)
    expect(selected.refreshing()).toBe(true)
    expect(selected.loading()).toBe(false)
    expect(store.refreshing()).toBe(true)
    expect(store.details()[42].refreshing).toBe(true)
    const error = new UserSessionError("NETWORK")
    owners.next(Result.failure(error))
    owners.complete()
    count.next(Result.failure(error))
    count.complete()
    detail.next(Result.failure(error))
    detail.complete()
    expect(selected.result()).toBe(page)
    expect(selected.error()).toBe(error)
    expect(store.sessionCount()).toBe(0)
    expect(store.loaded()).toBe(true)
    expect(store.error()).toBe(error)
    expect(store.details()[42].loaded).toBe(true)
    expect(store.details()[42].error).toBe(error)
    activity.unsubscribe()
    store.observeOwners({}).subscribe().unsubscribe()
    store.loadSessionCount().subscribe()
    store.loadDetails(42).subscribe()
    expect(repository.getSessionOwners).toHaveBeenCalledTimes(3)
    expect(repository.getSessionCount).toHaveBeenCalledTimes(3)
    expect(repository.getUserSessionsByUser).toHaveBeenCalledTimes(3)
    vi.advanceTimersByTime(119999)
    store.loadSessionCount().subscribe()
    expect(repository.getSessionCount).toHaveBeenCalledTimes(3)
    store.loadSessionCount(true).subscribe()
    store.loadDetails(42, true).subscribe()
    store.observeOwners({}, 0, true).subscribe().unsubscribe()
    expect(repository.getSessionOwners).toHaveBeenCalledTimes(4)
    expect(repository.getSessionCount).toHaveBeenCalledTimes(4)
    expect(repository.getUserSessionsByUser).toHaveBeenCalledTimes(4)
  })
  it("shares count/detail flights until their final subscriber leaves", () => {
    const { store, repository } = setup()
    const count = new Subject<Result<number, UserSessionError>>()
    const detail = new Subject<Result<UserSession[], UserSessionError>>()
    repository.getSessionCount.mockReturnValue(count)
    repository.getUserSessionsByUser.mockReturnValue(detail)
    const a = store.loadSessionCount().subscribe(),
      b = store.loadSessionCount().subscribe()
    const c = store.loadDetails(42).subscribe(),
      d = store.loadDetails(42).subscribe()
    a.unsubscribe()
    c.unsubscribe()
    expect(count.observed).toBe(true)
    expect(detail.observed).toBe(true)
    expect(repository.getSessionCount).toHaveBeenCalledOnce()
    expect(repository.getUserSessionsByUser).toHaveBeenCalledOnce()
    b.unsubscribe()
    d.unsubscribe()
    expect(count.observed).toBe(false)
    expect(detail.observed).toBe(false)
    expect(store.loading()).toBe(false)
    expect(store.details()[42].loading).toBe(false)
    expect(store.loaded()).toBe(false)
  })
  it("invalidates inactive variants/count/detail immediately after backend writes", () => {
    const { store, repository } = setup()
    store.observeOwners({}).subscribe().unsubscribe()
    store.loadSessionCount().subscribe()
    store.loadDetails(42).subscribe()
    store.revokeSessions(42).subscribe()
    expect(repository.getSessionCount).toHaveBeenCalledOnce()
    store.observeOwners({}).subscribe().unsubscribe()
    store.loadSessionCount().subscribe()
    store.loadDetails(42).subscribe()
    expect(repository.getSessionOwners).toHaveBeenCalledTimes(2)
    expect(repository.getSessionCount).toHaveBeenCalledTimes(2)
    expect(repository.getUserSessionsByUser).toHaveBeenCalledTimes(2)
    expect(repository.revokeUserSessions).toHaveBeenCalledOnce()
  })
  it("bounds inactive owner/detail history without evicting active views", () => {
    const { store, repository } = setup()
    const pinned = store.observeOwners({ search: "pinned" }).subscribe()
    const detail = store.observeDetails(42).subscribe()
    for (let i = 100; i < 130; i++) {
      store
        .observeOwners({ search: String(i) })
        .subscribe()
        .unsubscribe()
      store.loadDetails(i).subscribe()
    }
    expect(Object.keys(store.ownerEntries())).toHaveLength(21)
    expect(Object.keys(store.details())).toHaveLength(21)
    expect(store.selectOwners(signal({ search: "pinned" })).result()).toBe(page)
    expect(store.details()[42].loaded).toBe(true)
    store.loadDetails(42).subscribe()
    expect(repository.getUserSessionsByUser).toHaveBeenCalledTimes(31)
    pinned.unsubscribe()
    detail.unsubscribe()
    expect(Object.keys(store.ownerEntries())).toHaveLength(20)
    expect(Object.keys(store.details())).toHaveLength(20)
  })
  it("count-only activity establishes session fencing and preserves same-session renewal", () => {
    const { store, repository, session, changes } = setup()
    store.loadSessionCount().subscribe()
    changes.next(session())
    store.loadSessionCount().subscribe()
    expect(repository.getSessionCount).toHaveBeenCalledOnce()
    const pending = new Subject<Result<number, UserSessionError>>()
    repository.getSessionCount.mockReturnValueOnce(pending)
    store.loadSessionCount(true).subscribe()
    session.set(null)
    changes.next(null)
    expect(pending.observed).toBe(false)
    pending.next(Result.success(99))
    expect(store.sessionCount()).toBeUndefined()
    expect(store.loaded()).toBe(false)
  })
})
