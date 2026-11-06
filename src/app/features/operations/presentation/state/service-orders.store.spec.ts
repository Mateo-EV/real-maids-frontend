import {
  computed,
  createEnvironmentInjector,
  EnvironmentInjector,
  PLATFORM_ID
} from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Observable, Subscription } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import {
  GetServiceOrderByIdUseCase,
  ListServiceOrdersUseCase
} from "../../application/use-cases/service-order-read.use-cases"
import { OperationsError } from "../../domain/errors/operations.error"
import { ServiceOrderDetail, ServiceOrderSummary } from "../../domain/models/operations-read.models"
import { ServiceOrderQuery } from "../../domain/params/operations.params"
import { ServiceOrdersStore } from "./service-orders.store"
import { ControlledOrderReads, orderDetail, orderPage } from "./service-orders.store.testing"

type Page = PaginationResponse<ServiceOrderSummary>
type ReadResult = Result<Page | ServiceOrderDetail, OperationsError>
type Kind = "list" | "detail"
const deadline = 4102444800000
const caller = (id = 19, expires = deadline, name = "Caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, expires, id)

// T6A/S1,S3,S4,S5: public selectors/observations only. Existing application ports
// are doubled; real session-scope behavior remains under test. No mutation seam.
describe("ServiceOrdersStore root consumer-owned order reads", () => {
  let store: InstanceType<typeof ServiceOrdersStore>
  let lists: ControlledOrderReads<ServiceOrderQuery, Page>
  let details: ControlledOrderReads<number, ServiceOrderDetail>
  let session: BehaviorSubject<AuthSession | null>
  let subscriptions: Subscription[]
  let authFactory: ReturnType<typeof vi.fn>
  let sessionFactory: ReturnType<typeof vi.fn>

  beforeEach(() => {
    subscriptions = []
    lists = new ControlledOrderReads()
    details = new ControlledOrderReads()
    session = new BehaviorSubject<AuthSession | null>(caller())
    authFactory = vi.fn(() => ({ session: () => session.value }))
    sessionFactory = vi.fn(() => ({ execute: () => session.asObservable() }))
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: AuthStore, useFactory: authFactory },
        { provide: ObserveAuthSessionUseCase, useFactory: sessionFactory },
        { provide: ListServiceOrdersUseCase, useValue: lists },
        { provide: GetServiceOrderByIdUseCase, useValue: details }
      ]
    })
  })

  afterEach(() => {
    try {
      subscriptions.forEach(subscription => subscription.unsubscribe())
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  function setup() {
    store = TestBed.inject(ServiceOrdersStore)
  }
  function track(read: Observable<ReadResult>, next?: (result: ReadResult) => void) {
    const subscription = read.subscribe(next)
    subscriptions.push(subscription)
    return subscription
  }
  function observe(kind: Kind, id = 17, force = false) {
    return kind === "list"
      ? store.observeOrders({ customerId: id }, force)
      : store.observeOrder(id, force)
  }
  function select(kind: Kind, id = 17) {
    return kind === "list" ? store.selectOrders({ customerId: id }) : store.selectOrder(id)
  }
  function calls(kind: Kind) {
    return kind === "list" ? lists.calls : details.calls
  }
  function latest(kind: Kind) {
    return kind === "list" ? lists.latest() : details.latest()
  }
  function succeed(kind: Kind, id = 17) {
    if (kind === "list") lists.latest().succeed(orderPage([id]))
    else details.latest().succeed(orderDetail(id))
  }

  describe("S5 success-only 30000ms freshness", () => {
    it.each(["list", "detail"] as const)(
      "%s checks the exact expiry on revisits, without polling or cache-hit renewal",
      kind => {
        vi.useFakeTimers()
        vi.setSystemTime(1000)
        setup()
        const view = computed(() => select(kind))
        expect(view()).toEqual({
          result: undefined,
          loading: false,
          refreshing: false,
          error: undefined,
          expires: 0
        })
        const first = track(observe(kind))
        expect(view()).toMatchObject({ loading: true, refreshing: false })
        succeed(kind)
        const verified = view().result
        expect(verified).toBeDefined()
        expect(view().expires).toBe(31000)
        first.unsubscribe()
        vi.advanceTimersByTime(29999)
        track(observe(kind)).unsubscribe()
        expect(calls(kind)).toHaveLength(1)
        expect(view().expires).toBe(31000)
        vi.advanceTimersByTime(1)
        expect(calls(kind)).toHaveLength(1)
        const revisit = track(observe(kind))
        expect(calls(kind)).toHaveLength(2)
        expect(view()).toMatchObject({ result: verified, loading: false, refreshing: true })
        succeed(kind)
        expect(view().expires).toBe(61000)
        vi.advanceTimersByTime(90000)
        expect(calls(kind)).toHaveLength(2)
        revisit.unsubscribe()
      }
    )

    it.each(["list", "detail"] as const)(
      "%s forces a fresh read, retains verified data on failure, and does not renew failed freshness",
      kind => {
        vi.spyOn(Date, "now").mockReturnValue(1000)
        setup()
        track(observe(kind)).unsubscribe()
        // The first consumer was cancelled before a response; a new read must start.
        track(observe(kind))
        succeed(kind)
        const verified = select(kind).result
        track(observe(kind, 17, true))
        expect(calls(kind)).toHaveLength(3)
        expect(select(kind)).toMatchObject({ result: verified, loading: false, refreshing: true })
        latest(kind).fail()
        expect(select(kind)).toMatchObject({
          result: verified,
          loading: false,
          refreshing: false,
          error: { code: "FORBIDDEN" }
        })
        expect(select(kind).expires).toBeLessThanOrEqual(1000)
        track(observe(kind))
        expect(calls(kind)).toHaveLength(4)
        succeed(kind)
        expect(select(kind)).toMatchObject({ error: undefined, expires: 31000 })
      }
    )

    it("retains a verified empty/zero page through an expired failed refresh", () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1000)
      setup()
      track(store.observeOrders())
      const empty = orderPage([])
      lists.latest().succeed(empty)
      now.mockReturnValue(31000)
      track(store.observeOrders())
      expect(store.selectOrders()).toMatchObject({
        result: empty,
        refreshing: true,
        loading: false
      })
      lists.latest().fail()
      expect(store.selectOrders()).toMatchObject({
        result: empty,
        refreshing: false,
        error: { code: "FORBIDDEN" }
      })
      expect(store.selectOrders().expires).toBeLessThanOrEqual(31000)
    })

    it("distinguishes unverified failures, catches thrown errors and rejects empty use-case completion", () => {
      setup()
      track(store.observeOrders())
      lists.latest().throwError(new Error("Untrusted transport detail"))
      expect(store.selectOrders()).toMatchObject({
        result: undefined,
        loading: false,
        refreshing: false,
        error: { code: "UNKNOWN" },
        expires: 0
      })
      track(store.observeOrder(17))
      details.latest().completeEmpty()
      expect(store.selectOrder(17)).toMatchObject({
        result: undefined,
        loading: false,
        refreshing: false,
        error: { code: "INVALID_RESPONSE" },
        expires: 0
      })
    })
  })

  describe("S5 normalized independent keys and ref-counted force joining", () => {
    it("is root-provided, lazy on construction/selection, and cold until observation subscription", () => {
      setup()
      expect(TestBed.inject(ServiceOrdersStore)).toBe(store)
      store.selectOrders()
      store.selectOrder(17)
      const read = store.observeOrders()
      store.observeOrder(17)
      expect(authFactory).not.toHaveBeenCalled()
      expect(sessionFactory).not.toHaveBeenCalled()
      expect(lists.calls).toHaveLength(0)
      expect(details.calls).toHaveLength(0)
      track(read)
      expect(lists.calls).toHaveLength(1)
      expect(authFactory).toHaveBeenCalledTimes(1)
      expect(sessionFactory).toHaveBeenCalledTimes(1)
    })

    it("snapshots and normalizes the full query without capping requested size or rewriting effective data", () => {
      setup()
      const query: ServiceOrderQuery = {
        offset: 400,
        limit: 200,
        customerId: 99,
        staffId: 7,
        status: "  custom_state  ",
        from: "2026-03-01",
        until: "2026-03-03"
      }
      const original = { ...query, status: "CUSTOM_STATE" }
      const read = store.observeOrders(query)
      query.customerId = 100
      const view = computed(() => store.selectOrders(original))
      track(read)
      track(store.observeOrders(original))
      expect(lists.calls).toHaveLength(1)
      expect(lists.latest().key).toEqual(original)
      const page = orderPage([18, 17], 200, 100, 202)
      lists.latest().succeed(page)
      expect(view().result).toBe(page)
      expect(view().result?.items.map(item => item.id)).toEqual([18, 17])
      for (const other of [
        { offset: 200 },
        { limit: 100 },
        { customerId: 100 },
        { staffId: 8 },
        { status: "PENDIENTE" },
        { from: "2026-03-02" },
        { until: "2026-03-04" }
      ])
        expect(store.selectOrders({ ...original, ...other }).result).toBeUndefined()
      track(store.observeOrders({ ...original, staffId: 8 }))
      expect(lists.calls).toHaveLength(2)
      lists.latest().succeed(orderPage([]))
      expect(view().result).toBe(page)
      expect(store.selectOrders({ ...original, staffId: 8 }).result?.total).toBe(0)
    })

    it("shares blank-status/default queries and preserves independent list/detail results", () => {
      setup()
      track(store.observeOrders({ status: "  " }))
      track(store.observeOrders({ offset: 0, limit: 20 }))
      track(store.observeOrder(17))
      expect(lists.calls).toHaveLength(1)
      expect(details.calls).toHaveLength(1)
      const detail = orderDetail()
      details.latest().succeed(detail)
      expect(store.selectOrder(17).result).toBe(detail)
      expect(store.selectOrders().result).toBeUndefined()
      lists.latest().succeed(orderPage([]))
      expect(store.selectOrder(17).result).toBe(detail)
      expect(store.selectOrders().result?.total).toBe(0)
    })

    it.each(["list", "detail"] as const)(
      "%s joins normal/forced observers, isolates other keys, and cancels only the last observer",
      kind => {
        setup()
        const first = track(observe(kind))
        const forced = track(observe(kind, 17, true))
        expect(calls(kind)).toHaveLength(1)
        const shared = latest(kind)
        const independent = track(observe(kind, 18))
        const other = latest(kind)
        expect(calls(kind)).toHaveLength(2)
        first.unsubscribe()
        expect(shared.cancelled).toBe(false)
        expect(select(kind).loading).toBe(true)
        forced.unsubscribe()
        expect(shared.cancelled).toBe(true)
        expect(select(kind)).toMatchObject({ result: undefined, loading: false, refreshing: false })
        expect(other.cancelled).toBe(false)
        succeed(kind, 18)
        expect(select(kind, 18).result).toBeDefined()
        expect(select(kind).result).toBeUndefined()
        independent.unsubscribe()
        track(observe(kind))
        expect(calls(kind)).toHaveLength(3)
        succeed(kind)
      }
    )

    it("cancelling a shared stale refresh settles status without discarding verified data", () => {
      setup()
      track(store.observeOrder(17))
      details.latest().succeed(orderDetail())
      const verified = store.selectOrder(17).result
      const first = track(store.observeOrder(17, true))
      const second = track(store.observeOrder(17, true))
      expect(details.calls).toHaveLength(2)
      const pending = details.latest()
      first.unsubscribe()
      expect(pending.cancelled).toBe(false)
      second.unsubscribe()
      expect(pending.cancelled).toBe(true)
      expect(store.selectOrder(17)).toMatchObject({
        result: verified,
        loading: false,
        refreshing: false,
        error: undefined
      })
    })
  })

  describe("S5 bounded twenty-entry registries and admission safety", () => {
    it.each(["list", "detail"] as const)(
      "%s evicts inactive history only, keeping active results pinned at the twenty-entry bound",
      kind => {
        setup()
        track(observe(kind, 1))
        succeed(kind, 1)
        const pinned = select(kind, 1).result
        for (let id = 2; id <= 22; id++) {
          const read = track(observe(kind, id))
          succeed(kind, id)
          read.unsubscribe()
        }
        expect(select(kind, 1).result).toBe(pinned)
        expect(select(kind, 2).result).toBeUndefined()
        expect(select(kind, 3).result).toBeUndefined()
        expect(select(kind, 4).result).toBeDefined()
        expect(select(kind, 22).result).toBeDefined()
        track(observe(kind, 1)).unsubscribe()
        expect(calls(kind)).toHaveLength(22)
      }
    )

    it.each(["list", "detail"] as const)(
      "%s rejects excess admission without disturbing active/in-flight views, then admits a released slot",
      kind => {
        setup()
        const active = Array.from({ length: 20 }, (_, index) => {
          const read = track(observe(kind, index + 1))
          if (index < 19) succeed(kind, index + 1)
          return read
        })
        const pending = latest(kind)
        const verified = select(kind, 1)
        const rejected: ReadResult[] = []
        track(observe(kind, 21), result => rejected.push(result))
        expect(rejected).toMatchObject([{ success: false, error: { code: "UNAVAILABLE" } }])
        expect(calls(kind)).toHaveLength(20)
        expect(select(kind, 1)).toEqual(verified)
        expect(select(kind, 20).loading).toBe(true)
        expect(pending.cancelled).toBe(false)
        expect(select(kind, 21)).toMatchObject({ result: undefined, loading: false })
        // The other registry has its own twenty-key budget.
        track(observe(kind === "list" ? "detail" : "list", 21))
        expect(calls(kind === "list" ? "detail" : "list")).toHaveLength(1)
        active[18].unsubscribe()
        track(observe(kind, 21))
        expect(calls(kind)).toHaveLength(21)
        succeed(kind, 21)
        expect(select(kind, 19).result).toBeUndefined()
        expect(select(kind, 1)).toEqual(verified)
        expect(select(kind, 20).loading).toBe(true)
        expect(pending.cancelled).toBe(false)
        // Late delivery from this still-legitimate flight remains usable.
        if (kind === "list") lists.calls[19].succeed(orderPage([20]))
        else details.calls[19].succeed(orderDetail(20))
        expect(select(kind, 20)).toMatchObject({ loading: false, refreshing: false })
        expect(select(kind, 20).result).toBeDefined()
      }
    )

    it("rejects malformed queries/IDs before admission, preserving a full verified history", () => {
      setup()
      for (let id = 1; id <= 20; id++) {
        const page = track(store.observeOrders({ customerId: id }))
        lists.latest().succeed(orderPage([id]))
        page.unsubscribe()
        const detail = track(store.observeOrder(id))
        details.latest().succeed(orderDetail(id))
        detail.unsubscribe()
      }
      const page = store.selectOrders({ customerId: 1 })
      const detail = store.selectOrder(1)
      const invalid: ServiceOrderQuery[] = [
        { offset: -1 },
        { offset: 1, limit: 20 },
        { limit: 0 },
        { limit: 1.5 },
        { limit: 2147483648 },
        { offset: Number.MAX_SAFE_INTEGER + 1 },
        { offset: 2147483648, limit: 1 },
        { customerId: 0 },
        { staffId: 2147483648 },
        { from: "2026-02-29" },
        { until: "2026-13-01" },
        { from: "2026-03-03", until: "2026-03-02" },
        { status: 5 } as unknown as ServiceOrderQuery
      ]
      const rejected: ReadResult[] = []
      invalid.forEach(query => {
        track(store.observeOrders(query), result => rejected.push(result))
        expect(store.selectOrders(query).result).toBeUndefined()
      })
      const invalidIds = [0, -1, 1.5, NaN, Infinity, 2147483648]
      invalidIds.forEach(id => {
        track(store.observeOrder(id), result => rejected.push(result))
        expect(store.selectOrder(id).result).toBeUndefined()
      })
      expect(rejected).toHaveLength(invalid.length + invalidIds.length)
      rejected.forEach(result =>
        expect(result).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      )
      expect(lists.calls).toHaveLength(20)
      expect(details.calls).toHaveLength(20)
      expect(store.selectOrders({ customerId: 1 })).toEqual(page)
      expect(store.selectOrder(1)).toEqual(detail)
      track(store.observeOrders({ customerId: 1 })).unsubscribe()
      track(store.observeOrder(1)).unsubscribe()
      expect(lists.calls).toHaveLength(20)
      expect(details.calls).toHaveLength(20)
    })
  })

  describe("S1/S5 lazy session fencing, destruction and SSR", () => {
    it.each(["logout", "identity", "deadline", "expiry"] as const)(
      "%s clears both registries, cancels flights and fences late sensitive details; renewal preserves work",
      action => {
        const now = vi.spyOn(Date, "now").mockReturnValue(1000)
        session.next(caller(19, 60000))
        setup()
        const pageView = computed(() => store.selectOrders())
        const detailView = computed(() => store.selectOrder(17))
        track(store.observeOrders())
        lists.latest().succeed(orderPage())
        track(store.observeOrder(17))
        details.latest().succeed(orderDetail())
        expect(pageView().result).toBeDefined()
        expect(detailView().result?.property.accessInstructions).toBe("Synthetic instruction")
        let deliveries = 0
        const pageRead = track(store.observeOrders({}, true), () => deliveries++)
        const detailRead = track(store.observeOrder(17, true), () => deliveries++)
        const oldPage = lists.latest()
        const oldDetail = details.latest()
        session.next(caller(19, 60000, "Renewed label"))
        expect(oldPage.cancelled).toBe(false)
        expect(oldDetail.cancelled).toBe(false)
        track(store.observeOrders()).unsubscribe()
        expect(lists.calls).toHaveLength(2)
        if (action === "expiry") now.mockReturnValue(60000)
        session.next(
          action === "logout"
            ? null
            : action === "identity"
              ? caller(20, 60000)
              : caller(19, action === "deadline" ? 61000 : 60000)
        )
        expect(oldPage.cancelled).toBe(true)
        expect(oldDetail.cancelled).toBe(true)
        expect(pageRead.closed).toBe(true)
        expect(detailRead.closed).toBe(true)
        expect(deliveries).toBe(0)
        expect(pageView().result).toBeUndefined()
        expect(detailView().result).toBeUndefined()
        if (action === "identity" || action === "deadline") {
          track(store.observeOrder(17))
          const current = orderDetail()
          current.order.code = "CURRENT-SESSION"
          details.latest().succeed(current)
          oldDetail.succeed(orderDetail())
          oldPage.succeed(orderPage())
          expect(detailView().result).toBe(current)
          expect(pageView().result).toBeUndefined()
        } else {
          track(store.observeOrders())
          track(store.observeOrder(17))
          oldPage.succeed(orderPage())
          oldDetail.succeed(orderDetail())
          expect(lists.calls).toHaveLength(2)
          expect(details.calls).toHaveLength(2)
          expect(pageView().result).toBeUndefined()
          expect(detailView().result).toBeUndefined()
        }
      }
    )

    it("checks the fixed deadline on a read even without a session-source notification", () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1000)
      session.next(caller(19, 2000))
      setup()
      track(store.observeOrder(17))
      const pending = details.latest()
      now.mockReturnValue(2000)
      const expired = track(store.observeOrders())
      expect(expired.closed).toBe(true)
      expect(pending.cancelled).toBe(true)
      pending.succeed(orderDetail())
      expect(store.selectOrder(17).result).toBeUndefined()
      expect(lists.calls).toHaveLength(0)
    })

    it("destroying the owning injector cancels and clears without allowing retained references to read", () => {
      const owner = createEnvironmentInjector(
        [ServiceOrdersStore],
        TestBed.inject(EnvironmentInjector)
      )
      try {
        store = owner.get(ServiceOrdersStore)
        track(store.observeOrders())
        lists.latest().succeed(orderPage())
        const read = track(store.observeOrder(17))
        const pending = details.latest()
        owner.destroy()
        expect(read.closed).toBe(true)
        expect(pending.cancelled).toBe(true)
        pending.succeed(orderDetail())
        expect(store.selectOrders().result).toBeUndefined()
        expect(store.selectOrder(17).result).toBeUndefined()
        const afterDestroy = track(store.observeOrders())
        expect(afterDestroy.closed).toBe(true)
        expect(lists.calls).toHaveLength(1)
      } finally {
        if (!owner.destroyed) owner.destroy()
      }
    })

    it.each(["server", "guest"] as const)(
      "%s performs no use-case reads; SSR never initializes auth or its session source",
      kind => {
        if (kind === "server") TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
        else session.next(null)
        setup()
        const reads = [track(store.observeOrders()), track(store.observeOrder(17))]
        expect(reads.every(read => read.closed)).toBe(true)
        expect(lists.calls).toHaveLength(0)
        expect(details.calls).toHaveLength(0)
        expect(store.selectOrders().result).toBeUndefined()
        expect(store.selectOrder(17).result).toBeUndefined()
        if (kind === "server") {
          expect(authFactory).not.toHaveBeenCalled()
          expect(sessionFactory).not.toHaveBeenCalled()
        }
      }
    )
  })
})
