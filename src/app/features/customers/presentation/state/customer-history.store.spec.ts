import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, of, Subject } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { Result } from "@/app/shared/utils/result"
import { GetCustomerHistoryUseCase } from "../../application/use-cases/get-customer-history.use-case"
import { CustomerError } from "../../domain/errors/customer.error"
import { customerFixture } from "../../domain/customer.fixture"
import { CustomerHistory } from "../../domain/entities/customer-history"
import { CustomerHistoryStore } from "./customer-history.store"

const history = (id: number): CustomerHistory => ({
  customer: customerFixture(id, "Fixture"),
  requests: { items: [], total: 17, offset: 0, limit: 5 },
  orders: { items: [], total: 2, offset: 0, limit: 5 },
  support: { items: [], total: 0, offset: 0, limit: 5 }
})
describe("CustomerHistoryStore", () => {
  let getHistory: ReturnType<typeof vi.fn>
  let session: BehaviorSubject<AuthSession | null>
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1000)
    session = new BehaviorSubject<AuthSession | null>(
      AuthSession.create("Fixture", "fixture@example.test", null, 9999999, 7)
    )
    getHistory = vi.fn((id: number) => of(Result.success(history(id))))
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { session: () => session.value } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
        { provide: GetCustomerHistoryUseCase, useValue: { execute: getHistory } }
      ]
    })
  })
  afterEach(() => vi.restoreAllMocks())
  it("keys history by owner plus limit, preserves separate page totals and invalidates all owner variants", () => {
    const store = TestBed.inject(CustomerHistoryStore)
    store.loadHistory(1, 5).subscribe()
    store.loadHistory(1, 10).subscribe()
    store.loadHistory(2, 5).subscribe()
    expect(store.selectHistory(1, 5).data).toEqual(history(1))
    vi.mocked(Date.now).mockReturnValue(30999)
    store.loadHistory(1, 5).subscribe()
    expect(getHistory).toHaveBeenCalledTimes(3)
    vi.mocked(Date.now).mockReturnValue(31000)
    store.loadHistory(1, 5).subscribe()
    expect(getHistory).toHaveBeenCalledTimes(4)
    store.invalidateCustomer(1)
    expect(store.selectHistory(1, 5).expires).toBe(0)
    expect(store.selectHistory(1, 10).expires).toBe(0)
    expect(store.selectHistory(2, 5).expires).toBe(31000)
  })
  it.each([Number.NaN, Infinity, -Infinity])(
    "does not let non-finite history limit %s reuse a valid default-limit cache entry",
    limit => {
      const store = TestBed.inject(CustomerHistoryStore)
      store.loadHistory(1).subscribe()
      getHistory.mockReturnValueOnce(of(Result.failure(new CustomerError("INVALID_INPUT"))))
      store.loadHistory(1, limit).subscribe()
      expect(getHistory).toHaveBeenCalledTimes(2)
      expect(getHistory).toHaveBeenLastCalledWith(1, limit)
      expect(store.selectHistory(1).error).toBeUndefined()
      expect(store.selectHistory(1, limit).error?.code).toBe("INVALID_INPUT")
    }
  )
  it("invalidates every in-flight history variant without accepting late data", () => {
    const store = TestBed.inject(CustomerHistoryStore)
    store.loadHistory(1, 5).subscribe()
    const a = new Subject<Result<CustomerHistory, CustomerError>>()
    const b = new Subject<Result<CustomerHistory, CustomerError>>()
    getHistory.mockReturnValueOnce(a).mockReturnValueOnce(b)
    store.loadHistory(1, 5, true).subscribe()
    store.loadHistory(1, 10).subscribe()
    store.invalidateCustomer(1)
    a.next(Result.success(history(1)))
    b.next(Result.success(history(1)))
    expect(store.selectHistory(1, 5)).toMatchObject({ loaded: true, expires: 0, pendingReads: 0 })
    expect(store.selectHistory(1, 10)).toMatchObject({ loaded: false, expires: 0, pendingReads: 0 })
    expect(store.loading()).toBe(false)
  })
  it("retains independently paged history on failure and retries without a false empty projection", () => {
    const store = TestBed.inject(CustomerHistoryStore)
    store.loadHistory(1, 5).subscribe()
    getHistory.mockReturnValueOnce(of(Result.failure(new CustomerError("FORBIDDEN"))))
    store.loadHistory(1, 5, true).subscribe()
    expect(store.selectHistory(1, 5).data?.requests.total).toBe(17)
    expect(store.selectHistory(1, 5).data?.orders.total).toBe(2)
    expect(store.selectHistory(1, 5).error?.code).toBe("FORBIDDEN")
    expect(store.selectHistory(2, 5).data).toBeNull()
    store.loadHistory(1, 5, true).subscribe()
    expect(store.selectHistory(1, 5).error).toBeUndefined()
  })
  it("shares history reads and caps inactive variants independently of active owners", () => {
    const store = TestBed.inject(CustomerHistoryStore)
    const pending = new Subject<Result<CustomerHistory, CustomerError>>()
    getHistory.mockReturnValueOnce(pending)
    const a = store.loadHistory(1, 5).subscribe(),
      b = store.loadHistory(1, 5).subscribe()
    a.unsubscribe()
    expect(store.selectHistory(1, 5).pendingReads).toBe(1)
    for (let id = 2; id <= 25; id++) store.loadHistory(id, 5).subscribe()
    expect(Object.keys(store.histories()).length).toBeLessThanOrEqual(21)
    expect(store.selectHistory(1, 5).pendingReads).toBe(1)
    b.unsubscribe()
    expect(store.loading()).toBe(false)
    expect(Object.keys(store.histories()).length).toBeLessThanOrEqual(20)
  })
  it.each(["logout", "replacement"])("stops invalidation fan-out on reentrant %s", transition => {
    const store = TestBed.inject(CustomerHistoryStore)
    const pending = new Subject<Result<CustomerHistory, CustomerError>>()
    getHistory.mockReturnValueOnce(pending)
    store.loadHistory(1, 5).subscribe({
      complete: () => {
        session.next(
          transition === "logout"
            ? null
            : AuthSession.create("Replacement", "second@example.test", null, 9999999, 8)
        )
        store.loadHistory(1, 10).subscribe()
      }
    })
    store.loadHistory(1, 10).subscribe()
    store.invalidateCustomer(1)
    expect(store.selectHistory(1, 10).expires).toBe(transition === "logout" ? 0 : 31000)
    expect(store.selectHistory(1, 5).loaded).toBe(false)
    expect(store.loading()).toBe(false)
  })
  it("does not dispatch SSR reads", () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    const store = TestBed.inject(CustomerHistoryStore)
    store.loadHistory(1).subscribe()
    store.invalidateCustomer(1)
    expect(getHistory).not.toHaveBeenCalled()
  })
})
