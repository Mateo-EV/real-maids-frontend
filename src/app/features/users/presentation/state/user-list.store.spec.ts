import { TestBed } from "@angular/core/testing"
import { EMPTY, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GetUsersPageUseCase } from "../../application/use-cases/get-users-page.use-case"
import { UserListPage } from "../../domain/models/user-list-page"
import { UserListQuery } from "../../domain/models/user-list-query"
import { UserError } from "../../domain/errors/user.error"
import { Lang, User } from "../../domain/entities/user.entity"
import { Result } from "@/app/shared/utils/result"
import { UserListStore } from "./user-list.store"

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
const query: UserListQuery = { page: 2, size: 10, isActive: false, roleId: 0 }
const page: UserListPage = { items: [user], page: 2, size: 5, total: 11, totalPages: 3 }

describe("UserListStore ownership", () => {
  const read = { execute: vi.fn() }
  let store: InstanceType<typeof UserListStore>
  beforeEach(() => {
    vi.resetAllMocks()
    TestBed.configureTestingModule({
      providers: [UserListStore, { provide: GetUsersPageUseCase, useValue: read }]
    })
    store = TestBed.inject(UserListStore)
    read.execute.mockReturnValue(of(Result.success(page)))
  })
  it("keeps the effective server size and totals and snapshots the query", () => {
    const mutable = { ...query }
    const pending = store.load(mutable)
    mutable.page = 9
    pending.subscribe()
    expect(read.execute).toHaveBeenCalledExactlyOnceWith(query)
    expect(store.query()).toEqual(query)
    expect(store.result()).toEqual(page)
    expect(store.loaded()).toBe(true)
    expect(store.loading()).toBe(false)
  })
  it("cancels obsolete reads and rejects their late success/error", () => {
    const stale = new Subject<Result<UserListPage, UserError>>()
    read.execute.mockReturnValue(stale)
    store.load(query).subscribe()
    read.execute.mockReturnValue(of(Result.success(page)))
    store.load({ ...query, search: "latest" }).subscribe()
    expect(stale.observed).toBe(false)
    stale.next(Result.success({ ...page, items: [] }))
    stale.next(Result.failure(new UserError("NETWORK")))
    expect(store.result()).toEqual(page)
    expect(store.error()).toBeUndefined()
  })
  it("hides old results during loading, failure and cancellation, and retries the same query", () => {
    store.load(query).subscribe()
    const pending = new Subject<Result<UserListPage, UserError>>()
    read.execute.mockReturnValue(pending)
    const subscription = store.load(query).subscribe()
    expect(store.loaded()).toBe(false)
    expect(store.result()?.items).toEqual([])
    subscription.unsubscribe()
    expect(pending.observed).toBe(false)
    expect(store.loading()).toBe(false)
    read.execute.mockReturnValue(of(Result.failure(new UserError("NETWORK"))))
    store.load(store.query()).subscribe()
    expect(store.error()?.code).toBe("NETWORK")
    expect(store.loaded()).toBe(false)
    expect(read.execute).toHaveBeenLastCalledWith(query)
    read.execute.mockReturnValue(of(Result.success(page)))
    store.load(store.query()).subscribe()
    expect(store.error()).toBeUndefined()
    expect(store.loaded()).toBe(true)
  })
  it("clamps an empty out-of-range response exactly once and retains that new page", () => {
    read.execute.mockImplementation((q: UserListQuery) =>
      of(
        Result.success(
          q.page === 2
            ? { ...page, items: [], page: 2, total: 10, totalPages: 2 }
            : { ...page, items: [user], page: 1, total: 10, totalPages: 2 }
        )
      )
    )
    store.load(query).subscribe()
    expect(read.execute.mock.calls.map(args => args[0].page)).toEqual([2, 1])
    expect(store.query()).toEqual({ ...query, page: 1 })
    expect(store.result()?.page).toBe(1)
    expect(store.loaded()).toBe(true)
  })
  it("does not loop if the collection shrinks again during clamp", () => {
    read.execute.mockImplementation((q: UserListQuery) =>
      of(
        Result.success({
          ...page,
          page: q.page,
          items: [],
          total: q.page === 2 ? 10 : 0,
          totalPages: q.page === 2 ? 2 : 0
        })
      )
    )
    store.load(query).subscribe()
    expect(read.execute).toHaveBeenCalledTimes(2)
    expect(store.error()?.code).toBe("INVALID_RESPONSE")
    expect(store.loaded()).toBe(false)
  })
  it("recovers an empty collection to page zero and normalizes empty/error streams", () => {
    read.execute.mockImplementation((q: UserListQuery) =>
      of(Result.success({ ...page, page: q.page, items: [], total: 0, totalPages: 0 }))
    )
    store.load(query).subscribe()
    expect(store.query().page).toBe(0)
    expect(store.loaded()).toBe(true)
    read.execute.mockReturnValue(EMPTY)
    store.load(query).subscribe()
    expect(store.error()?.code).toBe("INVALID_RESPONSE")
    read.execute.mockReturnValue(throwError(() => new Error("offline")))
    store.load(query).subscribe()
    expect(store.error()?.code).toBe("UNEXPECTED")
  })
})
