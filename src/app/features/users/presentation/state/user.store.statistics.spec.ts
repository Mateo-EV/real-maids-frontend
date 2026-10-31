import { PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { EMPTY, Observable, of, Subject, throwError } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { GetUserStatisticsUseCase } from "../../application/use-cases/get-user-statistics.use-case"
import { GetUsersPageUseCase } from "../../application/use-cases/get-users-page.use-case"
import { UpdateUserStatusByIdUseCase } from "../../application/use-cases/update-user-status-by-id.use-case"
import { UserStatistics } from "../../domain/models/user-statistics"
import { UserError } from "../../domain/errors/user.error"
import { Result } from "@/app/shared/utils/result"
import { UserStore } from "./user.store"

type StatisticsResult = Result<UserStatistics, UserError>
const counts = { total: 3, active: 2, inactive: 1 }
const identity = () => AuthSession.create("Test", "test@example.test", null, null, 1)
function setup() {
  const session = signal<AuthSession | null>(identity())
  const changes = new Subject<AuthSession | null>()
  const pending = new Subject<StatisticsResult>()
  const read = { execute: vi.fn((): Observable<StatisticsResult> => pending) }
  const list = { execute: vi.fn(() => new Subject()) }
  const write = {
    execute: vi.fn((): Observable<Result<undefined, UserError>> => of(Result.success(undefined)))
  }
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthStore, useValue: { session } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
      { provide: GetUserStatisticsUseCase, useValue: read },
      { provide: GetUsersPageUseCase, useValue: list },
      { provide: UpdateUserStatusByIdUseCase, useValue: write }
    ]
  })
  return { store: TestBed.inject(UserStore), session, changes, pending, read, list, write }
}

describe("root-owned global statistics", () => {
  afterEach(() => vi.useRealTimers())
  it("settles statistics flags before delivering failures and refreshed counts", () => {
    const { store, pending } = setup()
    const stats = store.selectStatistics()
    const received = vi.fn(() => [stats.loading(), stats.refreshing()])
    store.readStatistics().subscribe(received)
    pending.next(Result.failure(new UserError("NETWORK")))
    store.readStatistics().subscribe(received)
    pending.next(Result.success(counts))
    store.readStatistics(true).subscribe(received)
    pending.next(Result.success(counts))
    expect(received.mock.results.map(result => result.value)).toEqual([
      [false, false],
      [false, false],
      [false, false]
    ])
  })
  it("checks the two-minute TTL on reads, never polls or renews freshness on cache access", () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const { store, read } = setup()
    read.execute.mockReturnValue(of(Result.success(counts)))
    const stats = store.selectStatistics()
    store.readStatistics().subscribe()
    expect(stats.result()).toBe(counts)
    expect(stats.expires()).toBe(121000)
    vi.advanceTimersByTime(119999)
    store.readStatistics().subscribe()
    expect(stats.expires()).toBe(121000)
    expect(read.execute).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1)
    expect(read.execute).toHaveBeenCalledOnce()
    store.readStatistics().subscribe()
    expect(read.execute).toHaveBeenCalledTimes(2)
  })
  it("is lazy and shares in-flight reads, including forced retry, until the final caller cancels", () => {
    const { store, read, pending } = setup()
    const stats = store.selectStatistics()
    const request = store.readStatistics()
    expect(read.execute).not.toHaveBeenCalled()
    const first = request.subscribe()
    const second = store.observeStatistics().subscribe()
    const retry = store.readStatistics(true).subscribe()
    expect(read.execute).toHaveBeenCalledOnce()
    expect(stats.loading()).toBe(true)
    expect(stats.loaded()).toBe(false)
    first.unsubscribe()
    retry.unsubscribe()
    expect(pending.observed).toBe(true)
    second.unsubscribe()
    expect(pending.observed).toBe(false)
    expect(stats.loading()).toBe(false)
    expect(stats.refreshing()).toBe(false)
    expect(stats.loaded()).toBe(false)
    store.readStatistics().subscribe().unsubscribe()
    expect(read.execute).toHaveBeenCalledTimes(2)
  })
  it.each([
    [EMPTY, "INVALID_RESPONSE"],
    [throwError(() => new Error("unexpected")), "UNEXPECTED"],
    [throwError(() => new UserError("NETWORK")), "NETWORK"]
  ] as const)(
    "keeps empty/thrown failures unverified and can retry verified zero",
    (response, code) => {
      const { store, read } = setup()
      const stats = store.selectStatistics()
      read.execute.mockReturnValueOnce(response)
      store.readStatistics().subscribe()
      expect(stats.loaded()).toBe(false)
      expect(stats.result()).toBeUndefined()
      expect(stats.loading()).toBe(false)
      expect(stats.error()?.code).toBe(code)
      read.execute.mockReturnValueOnce(of(Result.success({ total: 0, active: 0, inactive: 0 })))
      store.readStatistics(true).subscribe()
      expect(stats.loaded()).toBe(true)
      expect(stats.result()?.total).toBe(0)
      expect(stats.error()).toBeUndefined()
    }
  )
  it("retains stale counts through failed expired revisit and shares a successful explicit retry", () => {
    vi.useFakeTimers()
    vi.setSystemTime(1000)
    const { store, read } = setup()
    const stats = store.selectStatistics()
    read.execute.mockReturnValueOnce(of(Result.success(counts)))
    store.readStatistics().subscribe()
    const expires = stats.expires()
    vi.advanceTimersByTime(120000)
    const pending = new Subject<StatisticsResult>()
    read.execute.mockReturnValueOnce(pending)
    const observer = store.observeStatistics().subscribe()
    const other = store.observeStatistics().subscribe()
    expect(read.execute).toHaveBeenCalledTimes(2)
    expect(stats.result()).toBe(counts)
    expect(stats.loaded()).toBe(true)
    expect(stats.loading()).toBe(false)
    expect(stats.refreshing()).toBe(true)
    pending.next(Result.failure(new UserError("FORBIDDEN")))
    expect(stats.error()?.code).toBe("FORBIDDEN")
    expect(stats.result()).toBe(counts)
    expect(stats.expires()).toBe(expires)
    expect(stats.refreshing()).toBe(false)
    const retry = new Subject<StatisticsResult>()
    read.execute.mockReturnValueOnce(retry)
    const first = store.readStatistics(true).subscribe()
    const second = store.readStatistics(true).subscribe()
    expect(read.execute).toHaveBeenCalledTimes(3)
    expect(stats.error()).toBeUndefined()
    expect(stats.result()).toBe(counts)
    first.unsubscribe()
    expect(retry.observed).toBe(true)
    const updated = { total: 4, active: 3, inactive: 1 }
    retry.next(Result.success(updated))
    expect(stats.result()).toBe(updated)
    expect(stats.expires()).toBe(241000)
    expect(stats.refreshing()).toBe(false)
    observer.unsubscribe()
    other.unsubscribe()
    second.unsubscribe()
  })
  it.each(["success", "partial"])(
    "invalidates stats and lists on %s once for shared observers, including synchronous failures",
    kind => {
      const { store, read, pending, write, list } = setup()
      const stats = store.selectStatistics()
      const left = store.observeStatistics().subscribe()
      const right = store.observeStatistics().subscribe()
      pending.next(Result.success(counts))
      const pageObserver = store.observeQuery({}).subscribe()
      write.execute.mockReturnValueOnce(
        of(
          kind === "success"
            ? Result.success(undefined)
            : Result.failure(new UserError("PARTIAL_UPDATE"))
        )
      )
      read.execute.mockReturnValueOnce(of(Result.failure(new UserError("NETWORK"))))
      store.updateUserStatusById(1, false).subscribe()
      expect(write.execute).toHaveBeenCalledOnce()
      expect(store.mutationRevision()).toBe(1)
      expect(store.error()?.code).toBe(kind === "partial" ? "PARTIAL_UPDATE" : undefined)
      expect(read.execute).toHaveBeenCalledTimes(2)
      expect(list.execute).toHaveBeenCalledTimes(2)
      expect(stats.result()).toBe(counts)
      expect(stats.expires()).toBe(0)
      expect(stats.refreshing()).toBe(false)
      expect(stats.error()?.code).toBe("NETWORK")
      left.unsubscribe()
      right.unsubscribe()
      pageObserver.unsubscribe()
      store.updateUserStatusById(1, true).subscribe()
      expect(read.execute).toHaveBeenCalledTimes(2)
      read.execute.mockReturnValueOnce(of(Result.success(counts)))
      store.readStatistics().subscribe()
      expect(read.execute).toHaveBeenCalledTimes(3)
    }
  )
  it("cancels invalidated flights and refreshes active statistics only once without dropping data", () => {
    const { store, read, pending, write } = setup()
    const stats = store.selectStatistics()
    const left = store.observeStatistics().subscribe()
    const right = store.observeStatistics().subscribe()
    pending.next(Result.success(counts))
    const old = new Subject<StatisticsResult>()
    read.execute.mockReturnValueOnce(old)
    store.readStatistics(true).subscribe()
    const refreshed = new Subject<StatisticsResult>()
    read.execute.mockReturnValueOnce(refreshed)
    store.updateUserStatusById(1, false).subscribe()
    expect(old.observed).toBe(false)
    old.next(Result.success({ total: 99, active: 99, inactive: 0 }))
    expect(stats.result()).toBe(counts)
    expect(stats.refreshing()).toBe(true)
    expect(stats.loading()).toBe(false)
    expect(read.execute).toHaveBeenCalledTimes(3)
    expect(write.execute).toHaveBeenCalledOnce()
    left.unsubscribe()
    expect(refreshed.observed).toBe(true)
    right.unsubscribe()
    expect(refreshed.observed).toBe(false)
    expect(stats.refreshing()).toBe(false)
    expect(stats.loaded()).toBe(true)
  })
  it("isolates statistics, listing and mutation statuses and does not invalidate on rejected writes", () => {
    const { store, pending, write, read } = setup()
    const stats = store.selectStatistics()
    const page = store.selectQuery(signal({}))
    store.observeQuery({}).subscribe()
    const observer = store.observeStatistics().subscribe()
    expect(stats.loading()).toBe(true)
    expect(page.loading()).toBe(true)
    expect(store.loading()).toBe(false)
    pending.next(Result.failure(new UserError("FORBIDDEN")))
    expect(stats.error()?.code).toBe("FORBIDDEN")
    expect(page.loading()).toBe(true)
    expect(page.error()).toBeUndefined()
    const mutation = new Subject<Result<undefined, UserError>>()
    write.execute.mockReturnValueOnce(mutation)
    store.updateUserStatusById(1, false).subscribe()
    expect(store.loading()).toBe(true)
    expect(stats.loading()).toBe(false)
    mutation.next(Result.failure(new UserError("USER_NOT_FOUND")))
    mutation.complete()
    expect(store.loading()).toBe(false)
    expect(read.execute).toHaveBeenCalledOnce()
    expect(store.mutationRevision()).toBe(0)
    observer.unsubscribe()
  })
  it.each(["logout", "replacement", "expiry"])(
    "clears verified state on %s and fences old reads and writes",
    kind => {
      vi.useFakeTimers()
      vi.setSystemTime(1000)
      const { store, session, changes, read, pending, write } = setup()
      session.set(AuthSession.create("Test", "test@example.test", null, 2000, 1))
      const stats = store.selectStatistics()
      const observer = store.observeStatistics().subscribe()
      pending.next(Result.success(counts))
      const late = new Subject<StatisticsResult>()
      read.execute.mockReturnValueOnce(late)
      store.readStatistics(true).subscribe()
      const mutation = new Subject<Result<undefined, UserError>>()
      write.execute.mockReturnValueOnce(mutation)
      store.updateUserStatusById(1, false).subscribe()
      if (kind === "expiry") {
        vi.setSystemTime(2000)
        store.readStatistics().subscribe()
      } else {
        session.set(
          kind === "logout"
            ? null
            : AuthSession.create("Other", "other@example.test", null, null, 2)
        )
        changes.next(session())
      }
      expect(late.observed).toBe(false)
      expect(stats.result()).toBeUndefined()
      expect(stats.loaded()).toBe(false)
      expect(stats.loading()).toBe(false)
      expect(stats.refreshing()).toBe(false)
      expect(stats.error()).toBeUndefined()
      expect(stats.expires()).toBe(0)
      late.next(Result.success(counts))
      mutation.next(Result.failure(new UserError("PARTIAL_UPDATE")))
      expect(stats.result()).toBeUndefined()
      expect(store.mutationRevision()).toBe(0)
      expect(store.error()).toBeUndefined()
      observer.unsubscribe()
    }
  )
  it("reuses statistics across same-identity credential renewal", () => {
    const { store, session, changes, pending, read } = setup()
    store.readStatistics().subscribe()
    pending.next(Result.success(counts))
    session.set(identity())
    changes.next(session())
    store.readStatistics().subscribe()
    expect(read.execute).toHaveBeenCalledOnce()
    expect(store.selectStatistics().result()).toBe(counts)
  })
  it("dispatches no statistics reads or auth observation on the server", () => {
    const read = { execute: vi.fn() }
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: "server" },
        { provide: GetUserStatisticsUseCase, useValue: read }
      ]
    })
    const store = TestBed.inject(UserStore)
    store.readStatistics(true).subscribe()
    store.observeStatistics().subscribe().unsubscribe()
    expect(read.execute).not.toHaveBeenCalled()
    expect(store.selectStatistics().loaded()).toBe(false)
  })
})
