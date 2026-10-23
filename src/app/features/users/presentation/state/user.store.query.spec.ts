import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { getState } from "@ngrx/signals"
import { of, Subject } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { GetUsersPageUseCase } from "../../application/use-cases/get-users-page.use-case"
import { UpdateUserStatusByIdUseCase } from "../../application/use-cases/update-user-status-by-id.use-case"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { UserListQuery } from "../../domain/models/user-list-query"
import { User } from "../../domain/entities/user.entity"
import { UserError } from "../../domain/errors/user.error"
import { Result } from "@/app/shared/utils/result"
import { UserStore, userQueryKey } from "./user.store"

type PageResult = Result<PaginationResponse<User>, UserError>
const page: PaginationResponse<User> = { items: [], offset: 0, limit: 10, total: 0 }
function setup() {
  const session = signal<AuthSession | null>(
    AuthSession.create("Test", "test@example.test", null, null, 1)
  )
  const changes = new Subject<AuthSession | null>()
  const pending = new Subject<PageResult>()
  const read = { execute: vi.fn((_query: UserListQuery) => pending) }
  const status = { execute: vi.fn(() => of(Result.success(undefined))) }
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthStore, useValue: { session } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
      { provide: GetUsersPageUseCase, useValue: read },
      { provide: UpdateUserStatusByIdUseCase, useValue: status }
    ]
  })
  return { store: TestBed.inject(UserStore), read, pending, status, session, changes }
}

describe("shared reactive query ownership", () => {
  it("publishes pending/error/result once in root state for same-query readonly projections", () => {
    const { store, read, pending } = setup()
    const left = store.selectQuery(signal<UserListQuery>({ search: " Ana " }))
    const right = store.selectQuery(signal<UserListQuery>({ search: "Ana", offset: 0, limit: 20 }))
    const first = store.observeQuery({ search: " Ana " }).subscribe()
    const second = store.observeQuery({ search: "Ana" }).subscribe()
    expect(read.execute).toHaveBeenCalledOnce()
    expect(left.entry()).toBe(right.entry())
    expect(getState(store)).toMatchObject({
      entries: {
        [userQueryKey({ search: "Ana" })]: {
          loading: true,
          refreshing: false,
          error: undefined,
          result: undefined
        }
      }
    })
    expect(left.result).not.toHaveProperty("set")
    expect(left.loading).not.toHaveProperty("set")
    expect(left.error).not.toHaveProperty("set")
    const error = new UserError("NETWORK")
    pending.next(Result.failure(error))
    expect(left.error()).toBe(error)
    expect(right.error()).toBe(error)
    expect(left.loading()).toBe(false)
    const retry = new Subject<PageResult>()
    read.execute.mockReturnValueOnce(retry)
    const forced = store.observeQuery({ search: "Ana" }, 0, true).subscribe()
    expect(left.loading()).toBe(true)
    expect(right.error()).toBeUndefined()
    retry.next(Result.success(page))
    expect(left.result()).toBe(page)
    expect(right.result()).toBe(page)
    expect(left.entry()).toBe(right.entry())
    expect(left.expires()).toBeGreaterThan(Date.now())
    first.unsubscribe()
    second.unsubscribe()
    forced.unsubscribe()
  })
  it("isolates different queries, pins active entries during history eviction and clears every projection on session loss", () => {
    const { store, read, pending, session, changes } = setup()
    const selected = signal<UserListQuery>({ search: "active" })
    const left = store.selectQuery(selected)
    const other = store.selectQuery(signal<UserListQuery>({ roleId: 9 }))
    const subscription = store.observeQuery(selected()).subscribe()
    pending.next(Result.success(page))
    read.execute.mockImplementation(() => {
      const response = new Subject<PageResult>()
      queueMicrotask(() => response.next(Result.success(page)))
      return response
    })
    // Completed history entries are evictable; an active view is not.
    for (let roleId = 0; roleId < 25; roleId++) {
      read.execute.mockReturnValueOnce(new Subject<PageResult>())
      const history = store.readPage({ roleId }).subscribe()
      history.unsubscribe()
    }
    expect(Object.keys(store.entries())).toHaveLength(20)
    expect(left.result()).toBe(page)
    expect(other.result()).toBeUndefined()
    expect(other.loading()).toBe(false)
    selected.set({ search: "unrelated" })
    expect(left.result()).toBeUndefined()
    expect(store.entries()[userQueryKey({ search: "active" })]?.result).toBe(page)
    session.set(null)
    changes.next(null)
    expect(store.entries()).toEqual({})
    expect(other.result()).toBeUndefined()
    subscription.unsubscribe()
  })
  it("refreshes two same-query observers once per mutation, retaining shared rows and retryable stale error", () => {
    const { store, pending, read, status } = setup()
    const query = signal<UserListQuery>({ offset: 0, limit: 10 })
    const left = store.selectQuery(query),
      right = store.selectQuery(query)
    const first = store.observeQuery(query()).subscribe()
    const second = store.observeQuery(query()).subscribe()
    pending.next(Result.success(page))
    const refresh = new Subject<PageResult>()
    read.execute.mockReturnValueOnce(refresh)
    store.updateUserStatusById(1, false).subscribe()
    expect(status.execute).toHaveBeenCalledOnce()
    expect(read.execute).toHaveBeenCalledTimes(2)
    expect(left.entry()).toBe(right.entry())
    expect(left.result()).toBe(page)
    expect(right.refreshing()).toBe(true)
    first.unsubscribe()
    expect(refresh.observed).toBe(true)
    refresh.next(Result.failure(new UserError("NETWORK")))
    expect(left.entry()).toBe(right.entry())
    expect(right.error()?.code).toBe("NETWORK")
    expect(right.result()).toBe(page)
    expect(right.expires()).toBe(0)
    second.unsubscribe()
  })
  it("bounds admitted concurrent queries without evicting active views, and releases capacity on cancellation", () => {
    const { store } = setup()
    const subscriptions = Array.from({ length: 20 }, (_, roleId) =>
      store.observeQuery({ roleId }).subscribe()
    )
    const denied = vi.fn()
    store.observeQuery({ roleId: 21 }).subscribe({ error: denied })
    expect(denied).toHaveBeenCalledOnce()
    expect(Object.keys(store.entries())).toHaveLength(20)
    expect(store.entries()[userQueryKey({ roleId: 0 })]?.loading).toBe(true)
    subscriptions[0].unsubscribe()
    const admitted = store.observeQuery({ roleId: 21 }).subscribe()
    expect(Object.keys(store.entries())).toHaveLength(20)
    expect(store.entries()[userQueryKey({ roleId: 21 })]?.loading).toBe(true)
    admitted.unsubscribe()
    subscriptions.forEach(subscription => subscription.unsubscribe())
  })
  it("does not mark a debounced fresh cache hit as permanently refreshing", async () => {
    const { store, pending, read } = setup()
    const query = signal<UserListQuery>({})
    const selection = store.selectQuery(query)
    store.readPage({}).subscribe()
    pending.next(Result.success(page))
    const subscription = store.observeQuery({}, 1).subscribe()
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(read.execute).toHaveBeenCalledOnce()
    expect(selection.result()).toBe(page)
    expect(selection.refreshing()).toBe(false)
    subscription.unsubscribe()
  })
  it("does not strand flags when the last subscriber cancels or a cache-hit callback invalidates the session", () => {
    const { store, read, pending, session, changes } = setup()
    const query = signal<UserListQuery>({})
    const selection = store.selectQuery(query)
    const first = store.observeQuery(query()).subscribe()
    first.unsubscribe()
    expect(pending.observed).toBe(false)
    expect(selection.loading()).toBe(false)
    const second = store.observeQuery(query()).subscribe()
    pending.next(Result.success(page))
    store
      .observeQuery(query())
      .subscribe(() => {
        session.set(null)
        changes.next(null)
      })
      .unsubscribe()
    expect(read.execute).toHaveBeenCalledTimes(2)
    expect(store.entries()).toEqual({})
    expect(selection.loading()).toBe(false)
    expect(selection.refreshing()).toBe(false)
    second.unsubscribe()
  })
})
