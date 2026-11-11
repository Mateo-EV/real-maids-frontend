import { signal } from "@angular/core"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { UpdateUserStatusByIdUseCase } from "../../application/use-cases/update-user-status-by-id.use-case"
import { UserStore, userQueryKey } from "./user.store"
import { TestBed } from "@angular/core/testing"
import { EMPTY, Observable, of, Subject, Subscription, throwError } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { GetUsersPageUseCase } from "../../application/use-cases/get-users-page.use-case"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { UserListQuery } from "../../domain/models/user-list-query"
import { UserError } from "../../domain/errors/user.error"
import { Lang, User } from "../../domain/entities/user.entity"
import { Result } from "@/app/shared/utils/result"
// Test interfaces own controls/subscriptions only, never writable read state.
function interfaceSelection() {
  const users = TestBed.inject(UserStore)
  const query = signal<UserListQuery>({ offset: 0, limit: 10 })
  const selection = users.selectQuery(query)
  let subscription = new Subscription()
  return {
    ...selection,
    load(requested: UserListQuery, delay = 0, force = false) {
      const snapshot = { ...requested }
      return new Observable<Result<PaginationResponse<User>, UserError>>(subscriber => {
        subscription.unsubscribe()
        if (userQueryKey(snapshot) !== userQueryKey(selection.query())) query.set(snapshot)
        const current = new Subscription()
        subscription = current
        current.add(users.observeQuery(query(), delay, force).subscribe(subscriber))
        return current
      })
    }
  }
}

const user = User.create(
  19,
  "Server",
  "server@example.test",
  Lang.ES,
  true,
  new Date(),
  new Date(),
  0
)
const query: UserListQuery = { offset: 20, limit: 10, isActive: false, roleId: 0 }
const page: PaginationResponse<User> = { items: [user], offset: 10, limit: 5, total: 11 }
const effectiveQuery = { ...query, offset: 10, limit: 5 }

describe("UserStore query projections and interface controls", () => {
  const read = { execute: vi.fn() }
  let store: ReturnType<typeof interfaceSelection>
  const session = signal<AuthSession | null>(null)
  let changes = new Subject<AuthSession | null>()
  const status = { execute: vi.fn() }
  beforeEach(() => {
    vi.resetAllMocks()
    session.set(AuthSession.create("Test", "test@example.test", null, null, 1))
    changes = new Subject<AuthSession | null>()
    TestBed.configureTestingModule({
      providers: [
        { provide: GetUsersPageUseCase, useValue: read },
        { provide: AuthStore, useValue: { session } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
        { provide: UpdateUserStatusByIdUseCase, useValue: status }
      ]
    })
    store = interfaceSelection()
    read.execute.mockReturnValue(of(Result.success(page)))
  })
  afterEach(() => vi.useRealTimers())
  it.each(["success", "failure"] as const)(
    "revisits an expired cached query with stale rows during revalidation and handles %s",
    outcome => {
      vi.useFakeTimers()
      vi.setSystemTime(1000)
      store.load(query).subscribe()
      const otherQuery = { offset: 0, limit: 10, search: "other" }
      const otherPage = { items: [], offset: 0, limit: 10, total: 0 }
      read.execute.mockReturnValueOnce(of(Result.success(otherPage)))
      store.load(otherQuery).subscribe()
      expect(store.result()).toEqual(otherPage)
      vi.advanceTimersByTime(120000)
      const refresh = new Subject<Result<PaginationResponse<User>, UserError>>()
      read.execute.mockReturnValueOnce(refresh)
      store.load(query).subscribe()
      // A revisit revalidates the effective page recorded by `adopt`, not the raw request.
      expect(read.execute).toHaveBeenLastCalledWith(effectiveQuery)
      expect(store.result()).toEqual(page)
      expect(store.query()).toEqual(effectiveQuery)
      expect(store.loaded()).toBe(true)
      expect(store.loading()).toBe(false)
      expect(store.refreshing()).toBe(true)
      const newcomer = interfaceSelection()
      const newcomerSubscription = newcomer.load(query).subscribe()
      expect(newcomer.result()).toEqual(page)
      expect(newcomer.loading()).toBe(false)
      expect(newcomer.refreshing()).toBe(true)
      expect(read.execute).toHaveBeenCalledTimes(3)
      newcomerSubscription.unsubscribe()
      expect(refresh.observed).toBe(true)
      const updated = { ...page, items: [] }
      refresh.next(
        outcome === "success" ? Result.success(updated) : Result.failure(new UserError("NETWORK"))
      )
      expect(store.refreshing()).toBe(false)
      expect(store.loading()).toBe(false)
      if (outcome === "success") {
        expect(store.result()).toEqual(updated)
        expect(store.error()).toBeUndefined()
      } else {
        expect(store.result()).toEqual(page)
        expect(store.loaded()).toBe(true)
        expect(store.error()?.code).toBe("NETWORK")
        // A failed refresh must not discard the root stale entry or extend its TTL.
        store.load(otherQuery).subscribe()
        const revisit = new Subject<Result<PaginationResponse<User>, UserError>>()
        read.execute.mockReturnValueOnce(revisit)
        store.load(query).subscribe()
        expect(revisit.observed).toBe(true)
        expect(store.result()).toEqual(page)
        revisit.next(Result.failure(new UserError("NETWORK")))
        read.execute.mockReturnValueOnce(of(Result.success(updated)))
        store.load(store.query(), 0, true).subscribe()
        expect(read.execute).toHaveBeenLastCalledWith(effectiveQuery)
        expect(store.result()).toEqual(updated)
        expect(store.error()).toBeUndefined()
      }
    }
  )
  it("reuses a fresh identical query instead of rereading", () => {
    store.load(query).subscribe()
    store.load(query).subscribe()
    expect(read.execute).toHaveBeenCalledOnce()
    expect(store.result()).toEqual(page)
  })
  it("keeps the effective server size and totals and snapshots the query", () => {
    expect(store.query()).toEqual({ offset: 0, limit: 10 })
    const mutable = { ...query }
    const pending = store.load(mutable)
    mutable.offset = 90
    pending.subscribe()
    expect(read.execute).toHaveBeenCalledExactlyOnceWith(query)
    expect(store.query()).toEqual(effectiveQuery)
    expect(store.result()).toEqual(page)
    expect(store.loaded()).toBe(true)
    expect(store.loading()).toBe(false)
  })
  it("retains the effective query on retry instead of restoring the requested limit", () => {
    store.load(query).subscribe()
    read.execute.mockReturnValue(of(Result.failure(new UserError("NETWORK"))))
    store.load(store.query(), 0, true).subscribe()
    expect(read.execute).toHaveBeenLastCalledWith(effectiveQuery)
    expect(store.query()).toEqual(effectiveQuery)
    expect(store.loaded()).toBe(true)
    expect(store.result()).toEqual(page)
    read.execute.mockReturnValue(of(Result.success(page)))
    store.load(store.query()).subscribe()
    expect(read.execute).toHaveBeenLastCalledWith(effectiveQuery)
    expect(store.loaded()).toBe(true)
  })
  it("cancels obsolete reads and rejects their late success/error", () => {
    const stale = new Subject<Result<PaginationResponse<User>, UserError>>()
    read.execute.mockReturnValue(stale)
    store.load(query).subscribe()
    read.execute.mockReturnValue(of(Result.success(page)))
    store.load({ ...query, search: "latest" }).subscribe()
    expect(stale.observed).toBe(false)
    stale.next(Result.success({ ...page, items: [] }))
    stale.next(Result.failure(new UserError("NETWORK")))
    expect(store.result()).toEqual(page)
    expect(store.query()).toEqual({ ...effectiveQuery, search: "latest" })
    expect(store.error()).toBeUndefined()
  })
  it("hides unrelated results during loading, failure and cancellation, and retries the same query", () => {
    store.load(query).subscribe()
    const pending = new Subject<Result<PaginationResponse<User>, UserError>>()
    read.execute.mockReturnValue(pending)
    const other = { ...query, search: "different" }
    const subscription = store.load(other).subscribe()
    expect(store.loaded()).toBe(false)
    expect(store.result()).toBeUndefined()
    subscription.unsubscribe()
    expect(pending.observed).toBe(false)
    expect(store.loading()).toBe(false)
    read.execute.mockReturnValue(of(Result.failure(new UserError("NETWORK"))))
    store.load(store.query()).subscribe()
    expect(store.error()?.code).toBe("NETWORK")
    expect(store.loaded()).toBe(false)
    expect(read.execute).toHaveBeenLastCalledWith(other)
    read.execute.mockReturnValue(of(Result.success(page)))
    store.load(store.query()).subscribe()
    expect(store.error()).toBeUndefined()
    expect(store.loaded()).toBe(true)
  })
  it("shares readers, preserves same-query rows on background failure, retries and cancels cleanly", () => {
    const second = interfaceSelection()
    const initial = { offset: 0, limit: 10 }
    const data = { ...page, offset: 0, limit: 10 }
    const pending = new Subject<Result<PaginationResponse<User>, UserError>>()
    read.execute.mockReturnValueOnce(pending)
    const firstSubscription = store.load(initial).subscribe()
    const secondSubscription = second.load(initial).subscribe()
    expect(read.execute).toHaveBeenCalledOnce()
    pending.next(Result.success(data))
    expect(store.result()).toEqual(data)
    expect(second.result()).toEqual(data)
    const refresh = new Subject<Result<PaginationResponse<User>, UserError>>()
    read.execute.mockReturnValueOnce(refresh)
    status.execute.mockReturnValue(of(Result.failure(new UserError("PARTIAL_UPDATE"))))
    TestBed.inject(UserStore).updateUserStatusById(19, false).subscribe()
    expect(read.execute).toHaveBeenCalledTimes(2)
    expect(store.loading()).toBe(false)
    expect(store.refreshing()).toBe(true)
    expect(store.result()).toEqual(data)
    firstSubscription.unsubscribe()
    expect(refresh.observed).toBe(true)
    refresh.next(Result.failure(new UserError("NETWORK")))
    expect(second.result()).toEqual(data)
    expect(second.loaded()).toBe(true)
    expect(second.error()?.code).toBe("NETWORK")
    expect(second.refreshing()).toBe(false)
    read.execute.mockReturnValueOnce(of(Result.success({ ...data, items: [] })))
    second.load(second.query(), 0, true).subscribe().unsubscribe()
    expect(second.error()).toBeUndefined()
    expect(second.result()?.items).toEqual([])
    secondSubscription.unsubscribe()
  })
  it("clears visible rows synchronously on session loss and rejects old in-flight data", () => {
    const data = { ...page, offset: 0, limit: 10 }
    read.execute.mockReturnValueOnce(of(Result.success(data)))
    store.load({ offset: 0, limit: 10 }).subscribe()
    const late = new Subject<Result<PaginationResponse<User>, UserError>>()
    read.execute.mockReturnValueOnce(late)
    store.load(store.query(), 0, true).subscribe()
    session.set(null)
    changes.next(null)
    expect(late.observed).toBe(false)
    expect(store.result()).toBeUndefined()
    expect(store.loaded()).toBe(false)
    expect(store.loading()).toBe(false)
    expect(store.refreshing()).toBe(false)
    late.next(Result.success(data))
    expect(store.result()).toBeUndefined()
  })
  it("refreshes the active effective page after success without replaying a write", () => {
    store.load(query).subscribe()
    const next = { ...page, items: [] }
    read.execute.mockReturnValueOnce(of(Result.success(next)))
    status.execute.mockReturnValue(of(Result.success(user)))
    TestBed.inject(UserStore).updateUserStatusById(19, false).subscribe()
    expect(read.execute).toHaveBeenLastCalledWith(effectiveQuery)
    expect(store.result()).toEqual(next)
    expect(store.loading()).toBe(false)
    expect(store.refreshing()).toBe(false)
    expect(status.execute).toHaveBeenCalledOnce()
  })
  it("clamps an empty out-of-range response exactly once using the effective limit", () => {
    read.execute
      .mockReturnValueOnce(of(Result.success({ ...page, items: [], total: 10 })))
      .mockReturnValueOnce(of(Result.success({ ...page, offset: 5, total: 10 })))
    store.load(query).subscribe()
    expect(read.execute.mock.calls.map(args => args[0])).toEqual([
      query,
      { ...query, offset: 5, limit: 5 }
    ])
    expect(store.query()).toEqual({ ...query, offset: 5, limit: 5 })
    expect(store.result()?.offset).toBe(5)
    expect(store.loaded()).toBe(true)
  })
  it("does not loop if the collection shrinks again during clamp", () => {
    read.execute
      .mockReturnValueOnce(of(Result.success({ ...page, items: [], total: 10 })))
      .mockReturnValueOnce(of(Result.success({ ...page, offset: 5, items: [], total: 0 })))
    store.load(query).subscribe()
    expect(read.execute).toHaveBeenCalledTimes(2)
    expect(store.error()?.code).toBe("INVALID_RESPONSE")
    expect(store.loaded()).toBe(false)
  })
  it("recovers an empty collection to offset zero and normalizes empty/error streams", () => {
    read.execute.mockImplementation((q: UserListQuery) =>
      of(Result.success({ ...page, offset: q.offset, items: [], total: 0 }))
    )
    store.load(query).subscribe()
    expect(read.execute.mock.calls.map(args => args[0])).toEqual([
      query,
      { ...query, offset: 0, limit: 5 }
    ])
    expect(store.query()).toEqual({ ...query, offset: 0, limit: 5 })
    expect(store.loaded()).toBe(true)
    read.execute.mockReturnValue(EMPTY)
    store.load(query, 0, true).subscribe()
    expect(store.error()?.code).toBe("INVALID_RESPONSE")
    read.execute.mockReturnValue(throwError(() => new Error("offline")))
    store.load(query, 0, true).subscribe()
    expect(store.error()?.code).toBe("UNEXPECTED")
  })
})
