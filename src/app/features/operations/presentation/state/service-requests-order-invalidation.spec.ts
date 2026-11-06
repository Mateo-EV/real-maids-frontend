import { TestBed } from "@angular/core/testing"
import { EMPTY } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createCaller,
  createOrderHarness,
  requestPage,
  requestSummary
} from "./service-orders-create.store.testing"
import { ServiceRequestsStore } from "./service-requests.store"

// The real root request store is used, not a public seam mock. History remains
// a public invalidation spy: this read-only seam must never invoke it.
describe("ServiceRequestsStore narrow order-creation read invalidation", () => {
  let h: ReturnType<typeof createOrderHarness>
  beforeEach(() => {
    h = createOrderHarness()
  })
  afterEach(() => {
    try {
      h.stop()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it("invalidates every page variant and only linked detail, sharing one refresh per active key", () => {
    const store = h.requests()
    h.track(store.observeRequests())
    h.track(store.observeRequests())
    h.requestLists.latest().succeed(requestPage())
    h.track(store.observeRequests({ customerId: 9 }))
    h.requestLists.latest().succeed(requestPage([99]))
    h.track(store.observeRequest(41))
    h.track(store.observeRequest(41))
    h.requestDetails.latest().succeed(requestSummary())
    h.track(store.observeRequest(99))
    h.requestDetails.latest().succeed(requestSummary(99))
    const before = store.selectRequests().result,
      unrelated = store.selectRequest(99)
    store.invalidateAfterOrderCreation(41)
    expect(h.requestLists.calls).toHaveLength(4)
    expect(h.requestLists.calls.slice(2).map(call => call.key)).toEqual([
      { offset: 0, limit: 20 },
      { offset: 0, limit: 20, customerId: 9 }
    ])
    expect(h.requestDetails.calls.map(call => call.key)).toEqual([41, 99, 41])
    expect(store.selectRequests()).toMatchObject({ result: before, refreshing: true })
    expect(store.selectRequest(99)).toEqual(unrelated)
    expect(store.writing()).toBe(false)
    expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
    expect(h.execute).not.toHaveBeenCalled()
  })

  it("expires inactive pages/linked detail without self-refresh, and does not admit an unknown detail", () => {
    const store = h.requests()
    const page = h.track(store.observeRequests())
    h.requestLists.latest().succeed(requestPage())
    const detail = h.track(store.observeRequest(41))
    h.requestDetails.latest().succeed(requestSummary())
    page.unsubscribe()
    detail.unsubscribe()
    store.invalidateAfterOrderCreation(41)
    expect(store.selectRequests()).toMatchObject({ expires: 0, result: { total: 1 } })
    expect(store.selectRequest(41)).toMatchObject({ expires: 0, result: { id: 41 } })
    store.invalidateAfterOrderCreation(123)
    expect(store.selectRequest(123).result).toBeUndefined()
    expect(h.requestLists.calls).toHaveLength(1)
    expect(h.requestDetails.calls).toHaveLength(1)
    h.track(store.observeRequest(41))
    expect(h.requestDetails.calls).toHaveLength(2)
    expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
  })

  it("preserves stale data on failed refresh and exposes a GET-only forced retry", () => {
    const store = h.requests()
    h.track(store.observeRequests())
    h.requestLists.latest().succeed(requestPage())
    const before = store.selectRequests().result
    store.invalidateAfterOrderCreation(41)
    h.requestLists.latest().fail("FORBIDDEN")
    expect(store.selectRequests()).toMatchObject({
      result: before,
      error: { code: "FORBIDDEN" },
      expires: 0
    })
    h.track(store.observeRequests({}, true))
    expect(h.requestLists.calls).toHaveLength(3)
    h.requestLists.latest().succeed(requestPage([]))
    expect(store.selectRequests()).toMatchObject({
      result: { items: [], total: 0 },
      error: undefined
    })
    expect(h.execute).not.toHaveBeenCalled()
    expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
  })

  it("leaves refresh ownership with observers, preserving other keys when one key loses its final caller", () => {
    const store = h.requests()
    const a = h.track(store.observeRequests()),
      b = h.track(store.observeRequests())
    h.requestLists.latest().succeed(requestPage())
    h.track(store.observeRequests({ status: "registrada" }))
    h.requestLists.latest().succeed(requestPage())
    store.invalidateAfterOrderCreation(41)
    expect(h.requestLists.calls).toHaveLength(4)
    const first = h.requestLists.calls[2],
      second = h.requestLists.calls[3]
    a.unsubscribe()
    expect(first.cancelled).toBe(false)
    b.unsubscribe()
    expect(first.cancelled).toBe(true)
    expect(second.cancelled).toBe(false)
    expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
  })

  it("cancels pre-invalidation flights and prevents late responses from overwriting the refreshed key", () => {
    const store = h.requests()
    h.track(store.observeRequests())
    const old = h.requestLists.latest()
    store.invalidateAfterOrderCreation(41)
    expect(old.cancelled).toBe(true)
    expect(h.requestLists.calls).toHaveLength(2)
    h.requestLists.latest().succeed(requestPage([]))
    old.succeed(requestPage())
    expect(store.selectRequests().result?.total).toBe(0)
    expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
  })

  it.each([0, -1, 2147483648, NaN])(
    "ignores invalid linked request ID %s without expiring verified entries",
    id => {
      const store = h.requests()
      h.track(store.observeRequests())
      h.requestLists.latest().succeed(requestPage())
      const before = store.selectRequests()
      expect(() => store.invalidateAfterOrderCreation(id)).not.toThrow()
      expect(store.selectRequests()).toEqual(before)
      expect(h.requestLists.calls).toHaveLength(1)
      expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
    }
  )

  it("does not continue fan-out after a refresh callback replaces the session", () => {
    const store = h.requests()
    h.track(store.observeRequests())
    h.requestLists.latest().succeed(requestPage())
    h.track(store.observeRequest(41))
    h.requestDetails.latest().succeed(requestSummary())
    vi.spyOn(h.requestLists, "execute").mockImplementationOnce(() => {
      h.session.next(createCaller(20))
      return EMPTY
    })
    store.invalidateAfterOrderCreation(41)
    expect(h.requestDetails.calls).toHaveLength(1)
    expect(store.selectRequests().result).toBeUndefined()
    expect(store.selectRequest(41).result).toBeUndefined()
    expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
  })

  it("does not need a write use case or history instance when the read-only seam has no admitted entries", () => {
    const store = h.requests()
    expect(() => store.invalidateAfterOrderCreation(41)).not.toThrow()
    expect(h.writeFactory).not.toHaveBeenCalled()
    expect(h.historyFactory).not.toHaveBeenCalled()
    expect(h.requestLists.calls).toHaveLength(0)
    expect(h.requestDetails.calls).toHaveLength(0)
    expect(store.writing()).toBe(false)
    expect(TestBed.inject(ServiceRequestsStore)).toBe(store)
  })
})
