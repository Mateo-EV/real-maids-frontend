import { TestBed } from "@angular/core/testing"
import { EMPTY, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GetUsersPageUseCase } from "../../application/use-cases/get-users-page.use-case"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
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
const query: UserListQuery = { offset: 20, limit: 10, isActive: false, roleId: 0 }
const page: PaginationResponse<User> = { items: [user], offset: 10, limit: 5, total: 11 }
const effectiveQuery = { ...query, offset: 10, limit: 5 }

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
    store.load(store.query()).subscribe()
    expect(read.execute).toHaveBeenLastCalledWith(effectiveQuery)
    expect(store.query()).toEqual(effectiveQuery)
    expect(store.loaded()).toBe(false)
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
  it("hides old results during loading, failure and cancellation, and retries the same query", () => {
    store.load(query).subscribe()
    const pending = new Subject<Result<PaginationResponse<User>, UserError>>()
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
    store.load(query).subscribe()
    expect(store.error()?.code).toBe("INVALID_RESPONSE")
    read.execute.mockReturnValue(throwError(() => new Error("offline")))
    store.load(query).subscribe()
    expect(store.error()?.code).toBe("UNEXPECTED")
  })
})
