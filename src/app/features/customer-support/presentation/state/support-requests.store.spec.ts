import { computed, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Observable, Subscription } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import {
  GetSupportRequestByIdUseCase,
  GetSupportRequestTypesUseCase,
  ListSupportRequestsUseCase
} from "../../application/use-cases/customer-support-read.use-cases"
import { CustomerSupportError } from "../../domain/errors/customer-support.error"
import {
  SupportDetail,
  SupportRequestTypeView,
  SupportRequestView
} from "../../domain/models/support-views"
import { SupportRequestQuery } from "../../domain/params/customer-support.params"
import { SupportRequestsStore } from "./support-requests.store"
import {
  ControlledSupportReads,
  supportDetail,
  supportPage,
  supportTypeViews
} from "./support-requests.store.testing"

type Page = PaginationResponse<SupportRequestView>
type Kind = "list" | "detail" | "types"
type ReadResult = Result<Page | SupportDetail | SupportRequestTypeView[], CustomerSupportError>
interface PendingRead {
  readonly cancelled: boolean
  succeed(value: unknown): void
}
interface ReadEntry {
  readonly result: Page | SupportDetail | SupportRequestTypeView[] | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: CustomerSupportError | undefined
  readonly expires: number
}
const deadline = 4102444800000
const caller = (id = 19, expires = deadline, name = "Caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, expires, id)

// T3/D2/S10: public selectors and observation subscriptions only. The existing
// application ports are doubled; the real session-read scope stays under test.
describe("SupportRequestsStore root consumer-owned support reads", () => {
  let store: InstanceType<typeof SupportRequestsStore>
  let pages: ControlledSupportReads<SupportRequestQuery, Page>
  let details: ControlledSupportReads<number, SupportDetail>
  let types: ControlledSupportReads<null, SupportRequestTypeView[]>
  let session: BehaviorSubject<AuthSession | null>
  let subscriptions: Subscription[]
  let authFactory: ReturnType<typeof vi.fn>
  let sessionFactory: ReturnType<typeof vi.fn>

  beforeEach(() => {
    subscriptions = []
    pages = new ControlledSupportReads()
    details = new ControlledSupportReads()
    types = new ControlledSupportReads()
    session = new BehaviorSubject<AuthSession | null>(caller())
    authFactory = vi.fn(() => ({ session: () => session.value }))
    sessionFactory = vi.fn(() => ({ execute: () => session.asObservable() }))
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: AuthStore, useFactory: authFactory },
        { provide: ObserveAuthSessionUseCase, useFactory: sessionFactory },
        { provide: ListSupportRequestsUseCase, useValue: pages },
        { provide: GetSupportRequestByIdUseCase, useValue: details },
        { provide: GetSupportRequestTypesUseCase, useValue: types }
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
    store = TestBed.inject(SupportRequestsStore)
  }
  function track(read: Observable<ReadResult>, next?: (result: ReadResult) => void) {
    const subscription = read.subscribe(next)
    subscriptions.push(subscription)
    return subscription
  }
  function observe(kind: Kind, id = 5, force = false): Observable<ReadResult> {
    if (kind === "list") return store.observeRequests({ customerId: id }, force)
    if (kind === "detail") return store.observeRequest(id, force)
    return store.observeRequestTypes(force)
  }
  function select(kind: Kind, id = 5): ReadEntry {
    if (kind === "list") return store.selectRequests({ customerId: id })
    if (kind === "detail") return store.selectRequest(id)
    return store.selectRequestTypes()
  }
  function calls(kind: Kind) {
    if (kind === "list") return pages.calls
    if (kind === "detail") return details.calls
    return types.calls
  }
  function latest(kind: Kind) {
    if (kind === "list") return pages.latest()
    if (kind === "detail") return details.latest()
    return types.latest()
  }
  function succeed(kind: Kind, id = 5) {
    if (kind === "list") pages.latest().succeed(supportPage([id]))
    else if (kind === "detail") details.latest().succeed(supportDetail(id))
    else types.latest().succeed(supportTypeViews())
  }

  describe("D2 success-only 30000ms freshness", () => {
    it.each(["list", "detail", "types"] as const)(
      "%s checks the exact expiry on reads, without polling or cache-hit renewal",
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
        track(observe(kind))
        expect(calls(kind)).toHaveLength(1)
        expect(view().expires).toBe(31000)
        // An expired entry is re-read on the next observation, keeping verified data.
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

    it.each(["list", "detail", "types"] as const)(
      "%s forces a fresh read over a fresh entry and does not renew freshness on failure",
      kind => {
        vi.spyOn(Date, "now").mockReturnValue(1000)
        setup()
        track(observe(kind))
        succeed(kind)
        const verified = select(kind).result
        // Explicit force bypasses a still-fresh entry.
        track(observe(kind, 5, true))
        expect(calls(kind)).toHaveLength(2)
        expect(select(kind)).toMatchObject({ result: verified, loading: false, refreshing: true })
        latest(kind).fail()
        // Verified same-key data survives the failed revalidation and stays visible.
        expect(select(kind)).toMatchObject({
          result: verified,
          loading: false,
          refreshing: false,
          error: { code: "FORBIDDEN" }
        })
        // A failed revalidation never renews freshness.
        expect(select(kind).expires).toBeLessThanOrEqual(1000)
        track(observe(kind))
        expect(calls(kind)).toHaveLength(3)
        succeed(kind)
        expect(select(kind)).toMatchObject({ error: undefined, expires: 31000 })
      }
    )

    it("retains a verified empty page through an expired failed refresh", () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1000)
      setup()
      track(store.observeRequests())
      const empty = supportPage([])
      pages.latest().succeed(empty)
      now.mockReturnValue(31000)
      track(store.observeRequests())
      expect(store.selectRequests()).toMatchObject({
        result: empty,
        refreshing: true,
        loading: false
      })
      pages.latest().fail()
      expect(store.selectRequests()).toMatchObject({
        result: empty,
        refreshing: false,
        error: { code: "FORBIDDEN" }
      })
      expect(store.selectRequests().expires).toBeLessThanOrEqual(31000)
    })

    it("distinguishes unverified failures, thrown errors and empty completion", () => {
      setup()
      track(store.observeRequests())
      pages.latest().throwError(new Error("Untrusted transport detail"))
      expect(store.selectRequests()).toMatchObject({
        result: undefined,
        loading: false,
        refreshing: false,
        error: { code: "UNEXPECTED" },
        expires: 0
      })
      track(store.observeRequest(5))
      details.latest().completeEmpty()
      expect(store.selectRequest(5)).toMatchObject({
        result: undefined,
        loading: false,
        error: { code: "INVALID_RESPONSE" },
        expires: 0
      })
    })
  })

  describe("S10 normalized keys, shared flights and independent families", () => {
    it("is root-provided and cold until an observer subscribes", () => {
      setup()
      expect(TestBed.inject(SupportRequestsStore)).toBe(store)
      store.selectRequests()
      store.selectRequest(5)
      store.selectRequestTypes()
      const reads = [store.observeRequests(), store.observeRequest(5), store.observeRequestTypes()]
      expect(authFactory).not.toHaveBeenCalled()
      expect(sessionFactory).not.toHaveBeenCalled()
      expect(pages.calls).toHaveLength(0)
      expect(details.calls).toHaveLength(0)
      expect(types.calls).toHaveLength(0)
      track(reads[0])
      expect(pages.calls).toHaveLength(1)
      expect(authFactory).toHaveBeenCalledTimes(1)
      expect(sessionFactory).toHaveBeenCalledTimes(1)
    })

    it("shares blank/default filter variants and never crosses distinct keys", () => {
      setup()
      track(store.observeRequests())
      track(store.observeRequests({ offset: 0, limit: 20, state: "  " }))
      expect(pages.calls).toHaveLength(1)
      track(store.observeRequests({ state: " recibida " }))
      expect(pages.calls).toHaveLength(2)
      const first = supportPage([5])
      pages.calls[0]?.succeed(first)
      expect(store.selectRequests().result).toBe(first)
      expect(store.selectRequests({ state: "RECIBIDA" }).result).toBeUndefined()
      const second = supportPage([6])
      pages.calls[1]?.succeed(second)
      expect(store.selectRequests({ state: "RECIBIDA" }).result).toBe(second)
      expect(store.selectRequests().result).toBe(first)
    })

    it.each(["list", "detail"] as const)(
      "%s joins observers of one key into a single read and isolates other keys",
      kind => {
        setup()
        const first = track(observe(kind))
        const forced = track(observe(kind, 5, true))
        // Two observers, one in-flight read and therefore one HTTP call.
        expect(calls(kind)).toHaveLength(1)
        const shared = latest(kind)
        const independent = track(observe(kind, 6))
        const other = latest(kind)
        expect(calls(kind)).toHaveLength(2)
        first.unsubscribe()
        expect(shared.cancelled).toBe(false)
        expect(select(kind, 5).loading).toBe(true)
        // Ref-counted cancellation: only the last observer releases the flight.
        forced.unsubscribe()
        expect(shared.cancelled).toBe(true)
        expect(select(kind, 5)).toMatchObject({
          result: undefined,
          loading: false,
          refreshing: false
        })
        expect(other.cancelled).toBe(false)
        succeed(kind, 6)
        expect(select(kind, 6).result).toBeDefined()
        expect(select(kind, 5).result).toBeUndefined()
        independent.unsubscribe()
      }
    )

    it("keeps the finite type catalog as one entry shared by every observer", () => {
      setup()
      const first = track(store.observeRequestTypes())
      track(store.observeRequestTypes(true))
      expect(types.calls).toHaveLength(1)
      track(store.observeRequests())
      expect(types.calls).toHaveLength(1)
      expect(pages.calls).toHaveLength(1)
      const catalog = supportTypeViews()
      types.calls[0]?.succeed(catalog)
      expect(store.selectRequestTypes()).toMatchObject({ result: catalog, refreshing: false })
      expect(store.selectRequests().result).toBeUndefined()
      first.unsubscribe()
    })

    it("rejects malformed paging/filters, states and IDs before admission", () => {
      setup()
      const pageRead = track(store.observeRequests({ customerId: 1 }))
      pages.latest().succeed(supportPage([1]))
      pageRead.unsubscribe()
      const detailRead = track(store.observeRequest(5))
      details.latest().succeed(supportDetail())
      detailRead.unsubscribe()
      const page = store.selectRequests({ customerId: 1 })
      const detail = store.selectRequest(5)
      const invalid: SupportRequestQuery[] = [
        { offset: -1 },
        { offset: 1, limit: 20 },
        { limit: 0 },
        { limit: 1.5 },
        { limit: 2147483648 },
        { offset: 2147483648, limit: 1 },
        { customerId: 0 },
        { requestTypeId: 2147483648 },
        { fromDate: "2026-02-29" },
        { toDate: "2026-13-01" },
        { fromDate: "2026-03-03", toDate: "2026-03-02" },
        { state: "ABIERTA" },
        { state: 5 } as unknown as SupportRequestQuery
      ]
      const rejected: ReadResult[] = []
      invalid.forEach(query => {
        track(store.observeRequests(query), result => rejected.push(result))
        expect(store.selectRequests(query).result).toBeUndefined()
      })
      ;[0, -1, 1.5, NaN, Infinity, 2147483648].forEach(id => {
        track(store.observeRequest(id), result => rejected.push(result))
        expect(store.selectRequest(id).result).toBeUndefined()
      })
      expect(rejected).toHaveLength(invalid.length + 6)
      rejected.forEach(result =>
        expect(result).toMatchObject({ success: false, error: { code: "VALIDATION" } })
      )
      expect(pages.calls).toHaveLength(1)
      expect(details.calls).toHaveLength(1)
      expect(store.selectRequests({ customerId: 1 })).toEqual(page)
      expect(store.selectRequest(5)).toEqual(detail)
    })
  })

  describe("S10 bounded registries and admission safety", () => {
    it.each(["list", "detail"] as const)(
      "%s rejects the twenty-first key without evicting an active view or its flight",
      kind => {
        setup()
        const active = Array.from({ length: 20 }, (_, index) => {
          const read = track(observe(kind, index + 1))
          if (index < 19) succeed(kind, index + 1)
          return read
        })
        const pending = latest(kind)
        const verified = select(kind, 1)
        expect(verified.result).toBeDefined()
        const rejected: ReadResult[] = []
        track(observe(kind, 21), result => rejected.push(result))
        expect(rejected).toMatchObject([{ success: false, error: { code: "UNAVAILABLE" } }])
        expect(calls(kind)).toHaveLength(20)
        expect(select(kind, 1)).toEqual(verified)
        expect(select(kind, 20).loading).toBe(true)
        expect(pending.cancelled).toBe(false)
        expect(select(kind, 21)).toMatchObject({ result: undefined, loading: false })
        // The released slot admits the rejected key by evicting inactive history only.
        active[18]?.unsubscribe()
        track(observe(kind, 21))
        expect(calls(kind)).toHaveLength(21)
        succeed(kind, 21)
        expect(select(kind, 19).result).toBeUndefined()
        expect(select(kind, 1)).toEqual(verified)
        expect(select(kind, 20).loading).toBe(true)
        expect(pending.cancelled).toBe(false)
      }
    )
  })

  describe("S10 lazy session fencing and SSR", () => {
    it("renews the same identity's credentials without clearing verified work", () => {
      vi.spyOn(Date, "now").mockReturnValue(1000)
      session.next(caller(19, 60000))
      setup()
      track(store.observeRequests())
      pages.latest().succeed(supportPage())
      track(store.observeRequest(5))
      details.latest().succeed(supportDetail())
      track(store.observeRequestTypes())
      types.latest().succeed(supportTypeViews())
      const page = store.selectRequests().result
      const detail = store.selectRequest(5).result
      const catalog = store.selectRequestTypes().result
      const flights = [
        track(store.observeRequests({}, true)),
        track(store.observeRequest(5, true)),
        track(store.observeRequestTypes(true))
      ]
      const pending: PendingRead[] = [pages.latest(), details.latest(), types.latest()]
      session.next(caller(19, 60000, "Renewed label"))
      expect(pending.every(call => !call.cancelled)).toBe(true)
      expect(flights.every(read => !read.closed)).toBe(true)
      expect(store.selectRequests().result).toBe(page)
      expect(store.selectRequest(5).result).toBe(detail)
      expect(store.selectRequestTypes().result).toBe(catalog)
      expect(pages.calls).toHaveLength(2)
      pending[0]?.succeed(supportPage([7]))
      pending[1]?.succeed(supportDetail(7))
      pending[2]?.succeed(supportTypeViews())
      expect(store.selectRequests().result?.total).toBe(1)
    })

    it.each(["logout", "identity"] as const)(
      "%s clears every family, cancels flights and fences late completions",
      action => {
        vi.spyOn(Date, "now").mockReturnValue(1000)
        session.next(caller(19, 60000))
        setup()
        track(store.observeRequests())
        pages.latest().succeed(supportPage())
        track(store.observeRequest(5))
        details.latest().succeed(supportDetail())
        track(store.observeRequestTypes())
        types.latest().succeed(supportTypeViews())
        const flights = [
          track(store.observeRequests({}, true)),
          track(store.observeRequest(5, true)),
          track(store.observeRequestTypes(true))
        ]
        const pending: PendingRead[] = [pages.latest(), details.latest(), types.latest()]
        session.next(action === "logout" ? null : caller(20, 60000))
        expect(pending.every(call => call.cancelled)).toBe(true)
        expect(flights.every(read => read.closed)).toBe(true)
        expect(store.selectRequests().result).toBeUndefined()
        expect(store.selectRequest(5).result).toBeUndefined()
        expect(store.selectRequestTypes().result).toBeUndefined()
        // Late completions from the fenced session cannot resurrect cleared entries.
        pending[0]?.succeed(supportPage([9]))
        pending[1]?.succeed(supportDetail(9))
        pending[2]?.succeed(supportTypeViews())
        expect(store.selectRequests().result).toBeUndefined()
        expect(store.selectRequest(5).result).toBeUndefined()
        expect(store.selectRequestTypes().result).toBeUndefined()
        // Only a live session dispatches again.
        const replay = [
          track(store.observeRequests()),
          track(store.observeRequest(5)),
          track(store.observeRequestTypes())
        ]
        const dispatched = action === "identity" ? 3 : 2
        expect(replay.every(read => read.closed === (action === "logout"))).toBe(true)
        expect(pages.calls).toHaveLength(dispatched)
        expect(details.calls).toHaveLength(dispatched)
        expect(types.calls).toHaveLength(dispatched)
        if (action === "identity") {
          const detail = supportDetail(7)
          details.latest().succeed(detail)
          expect(store.selectRequest(5).result).toBe(detail)
        }
      }
    )

    it("requires an unexpired credential before dispatching and never blocks observation", () => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1000)
      session.next(caller(19, 2000))
      setup()
      track(store.observeRequest(5))
      const pending = details.latest()
      now.mockReturnValue(2000)
      const expired = [track(store.observeRequests()), track(store.observeRequestTypes())]
      expect(expired.every(read => read.closed)).toBe(true)
      expect(pending.cancelled).toBe(true)
      pending.succeed(supportDetail())
      expect(pages.calls).toHaveLength(0)
      expect(types.calls).toHaveLength(0)
      expect(store.selectRequest(5).result).toBeUndefined()
    })

    it.each(["server", "guest"] as const)(
      "%s dispatches no read and SSR never initializes auth",
      kind => {
        if (kind === "server") TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
        else session.next(null)
        setup()
        const reads = [
          track(store.observeRequests()),
          track(store.observeRequest(5)),
          track(store.observeRequestTypes())
        ]
        expect(reads.every(read => read.closed)).toBe(true)
        expect(pages.calls).toHaveLength(0)
        expect(details.calls).toHaveLength(0)
        expect(types.calls).toHaveLength(0)
        expect(store.selectRequests().result).toBeUndefined()
        expect(store.selectRequest(5).result).toBeUndefined()
        expect(store.selectRequestTypes().result).toBeUndefined()
        if (kind === "server") {
          expect(authFactory).not.toHaveBeenCalled()
          expect(sessionFactory).not.toHaveBeenCalled()
        }
      }
    )
  })
})
