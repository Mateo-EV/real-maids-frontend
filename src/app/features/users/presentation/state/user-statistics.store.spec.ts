import { TestBed } from "@angular/core/testing"
import { EMPTY, Observable, of, Subject, throwError } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { UserError } from "../../domain/errors/user.error"
import { UserStatistics } from "../../domain/models/user-statistics"
import { GetUserStatisticsUseCase } from "../../application/use-cases/get-user-statistics.use-case"
import { UserStatisticsStore } from "./user-statistics.store"

describe("page-owned user statistics", () => {
  function setup() {
    const execute = vi.fn(
      (): Observable<Result<UserStatistics, UserError>> =>
        new Subject<Result<UserStatistics, UserError>>()
    )
    TestBed.configureTestingModule({
      providers: [UserStatisticsStore, { provide: GetUserStatisticsUseCase, useValue: { execute } }]
    })
    return { store: TestBed.inject(UserStatisticsStore), execute }
  }
  it("is lazy, cancels superseded reads and never verifies stale counts", () => {
    const { store, execute } = setup()
    const first = new Subject<Result<UserStatistics, UserError>>()
    const second = new Subject<Result<UserStatistics, UserError>>()
    execute.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const load = store.load()
    expect(execute).not.toHaveBeenCalled()
    load.subscribe()
    expect(store.loading()).toBe(true)
    store.load().subscribe()
    expect(first.observed).toBe(false)
    first.next(Result.success({ total: 99, active: 99, inactive: 0 }))
    second.next(Result.success({ total: 3, active: 2, inactive: 1 }))
    second.complete()
    expect(store.result()).toEqual({ total: 3, active: 2, inactive: 1 })
    expect(store.loaded()).toBe(true)
    expect(store.loading()).toBe(false)
  })
  it.each([
    [EMPTY, "INVALID_RESPONSE"],
    [throwError(() => new Error("unexpected")), "UNEXPECTED"]
  ] as const)("fails visibly for empty or thrown reads", (stream, code) => {
    const { store, execute } = setup()
    execute.mockReturnValueOnce(stream)
    store.load().subscribe()
    expect(store.loaded()).toBe(false)
    expect(store.loading()).toBe(false)
    expect(store.error()?.code).toBe(code)
  })
  it("keeps failures and cancellation unverified, then retries zero successfully", () => {
    const { store, execute } = setup()
    const read = new Subject<Result<UserStatistics, UserError>>()
    execute.mockReturnValue(read)
    const subscription = store.load().subscribe()
    subscription.unsubscribe()
    expect(read.observed).toBe(false)
    expect(store.loaded()).toBe(false)
    expect(store.loading()).toBe(false)
    store.load().subscribe()
    read.next(Result.failure(new UserError("FORBIDDEN")))
    read.complete()
    expect(store.error()?.code).toBe("FORBIDDEN")
    expect(store.loaded()).toBe(false)
    execute.mockReturnValueOnce(of(Result.success({ total: 0, active: 0, inactive: 0 })))
    store.load().subscribe()
    expect(store.loaded()).toBe(true)
    expect(store.error()).toBeUndefined()
    expect(store.result()?.total).toBe(0)
  })
})
