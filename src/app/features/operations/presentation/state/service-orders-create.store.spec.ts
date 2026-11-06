import { createEnvironmentInjector, EnvironmentInjector, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { EMPTY, firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { OperationsError } from "../../domain/errors/operations.error"
import { ServiceOrdersStore } from "./service-orders.store"
import {
  createCaller,
  createInput,
  createOrderHarness,
  requestPage,
  requestSummary
} from "./service-orders-create.store.testing"
import { orderDetail, orderPage } from "./service-orders.store.testing"

// T6C S1/S3/S4/S5: public actions, selectors and caller-owned observations.
// Existing adapters remain authoritative for DTO/body validation; no private maps.
describe("ServiceOrdersStore caller-owned order creation", () => {
  let h: ReturnType<typeof createOrderHarness>
  beforeEach(() => {
    h = createOrderHarness()
  })
  afterEach(() => {
    try {
      h.stop()
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })
  function seed() {
    const store = h.orders()
    h.track(store.observeOrders())
    h.lists.latest().succeed(orderPage())
    return store
  }
  function expectNoConfirmation() {
    expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
    expect(h.requestLists.calls).toHaveLength(0)
    expect(h.requestDetails.calls).toHaveLength(0)
  }

  it("captures the three-field input before subscription, remains cold and invokes only the existing use case", async () => {
    const store = h.orders(),
      input = createInput(),
      captured = { ...input }
    const operation = store.createOrder(input, 8)
    input.requestId = 99
    input.estimatedAmount = "99"
    input.observation = "changed"
    expect(store.writing()).toBe(false)
    expect(h.authFactory).not.toHaveBeenCalled()
    expect(h.writeFactory).not.toHaveBeenCalled()
    const pending = firstValueFrom(operation)
    expect(h.execute).toHaveBeenCalledExactlyOnceWith(captured)
    expect(h.writes.latest().key).toEqual(captured)
    expect(Object.keys(h.writes.latest().key).sort()).toEqual([
      "estimatedAmount",
      "observation",
      "requestId"
    ])
    expect(h.lists.calls).toHaveLength(0)
    expect(h.details.calls).toHaveLength(0)
    expectNoConfirmation()
    expect(store.writing()).toBe(true)
    h.writes.latest().succeed(orderDetail())
    expect(await pending).toMatchObject({ success: true, data: { order: { id: 17 } } })
    expect(store.writing()).toBe(false)
    expect(h.history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
  })

  it("uses a per-order-store duplicate gate and permits separate explicit subscriptions after settlement", async () => {
    const store = h.orders(),
      operation = store.createOrder(createInput(), 8)
    const first = firstValueFrom(operation)
    expect(store.writing()).toBe(true)
    expect(await firstValueFrom(store.createOrder(createInput(), 8))).toMatchObject({
      success: false,
      error: { code: "CONFLICT" }
    })
    expect(h.execute).toHaveBeenCalledTimes(1)
    h.writes.latest().succeed(orderDetail())
    await first
    const repeat = firstValueFrom(operation)
    expect(h.execute).toHaveBeenCalledTimes(2)
    h.writes.latest().succeed(orderDetail(18))
    expect((await repeat).success).toBe(true)
    expect(h.history.invalidateCustomer).toHaveBeenCalledTimes(2)
    expect(store.writing()).toBe(false)
  })

  it.each([0, -1, 2147483648, NaN])(
    "rejects invalid captured owner %s without touching verified reads or use-case counters",
    async owner => {
      const store = seed(),
        before = store.selectOrders()
      expect(await firstValueFrom(store.createOrder(createInput(), owner))).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
      expect(store.selectOrders()).toEqual(before)
      expect(h.execute).not.toHaveBeenCalled()
      expect(store.writing()).toBe(false)
      expectNoConfirmation()
    }
  )

  it("rejects a returned wrong owner before any confirmation or invalidation", async () => {
    const store = seed(),
      before = store.selectOrders(),
      requests = h.requests()
    h.track(requests.observeRequests())
    h.requestLists.latest().succeed(requestPage())
    h.track(requests.observeRequest(41))
    h.requestDetails.latest().succeed(requestSummary())
    const requestBefore = requests.selectRequests(),
      detailBefore = requests.selectRequest(41)
    const pending = firstValueFrom(store.createOrder(createInput(), 8))
    const wrong = orderDetail()
    wrong.order.customerId = 9
    wrong.property.customerId = 9
    h.writes.latest().succeed(wrong)
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    expect(store.selectOrders()).toEqual(before)
    expect(h.lists.calls).toHaveLength(1)
    expect(store.writing()).toBe(false)
    expect(requests.selectRequests()).toEqual(requestBefore)
    expect(requests.selectRequest(41)).toEqual(detailBefore)
    expect(h.requestLists.calls).toHaveLength(1)
    expect(h.requestDetails.calls).toHaveLength(1)
    expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
  })

  it.each(["result", "throw", "empty", "synchronous throw"] as const)(
    "normalizes %s failure safely, settles pending and preserves verified reads",
    async mode => {
      const store = seed(),
        before = store.selectOrders()
      if (mode === "synchronous throw")
        h.execute.mockImplementationOnce(() => {
          throw new Error("private backend detail")
        })
      const pending = firstValueFrom(store.createOrder(createInput(), 8))
      if (mode === "result") h.writes.latest().fail("FORBIDDEN")
      if (mode === "throw") h.writes.latest().throwError(new Error("private backend detail"))
      if (mode === "empty") h.writes.latest().completeEmpty()
      const result = await pending
      expect(result).toMatchObject({
        success: false,
        error: {
          code: mode === "result" ? "FORBIDDEN" : mode === "empty" ? "INVALID_RESPONSE" : "UNKNOWN"
        }
      })
      if (!result.success) {
        expect(result.error).toBeInstanceOf(OperationsError)
        expect(result.error.message).not.toContain("private backend detail")
      }
      expect(store.writing()).toBe(false)
      expect(store.selectOrders()).toEqual(before)
      expect(h.lists.calls).toHaveLength(1)
      expectNoConfirmation()
    }
  )

  it("cancels a caller-owned write without false delivery, refresh or history invalidation", () => {
    const store = seed(),
      before = store.selectOrders(),
      delivered = vi.fn()
    const sub = h.track(store.createOrder(createInput(), 8), delivered)
    const call = h.writes.latest()
    sub.unsubscribe()
    expect(call.cancelled).toBe(true)
    call.succeed(orderDetail())
    expect(delivered).not.toHaveBeenCalled()
    expect(store.writing()).toBe(false)
    expect(store.selectOrders()).toEqual(before)
    expect(h.lists.calls).toHaveLength(1)
    expectNoConfirmation()
  })

  it("refreshes independent active order/request keys exactly once, sharing same-key observers and keeping stale rows", async () => {
    const store = seed(),
      requests = h.requests()
    const old = store.selectOrders().result
    h.track(store.observeOrders())
    h.track(store.observeOrders({ customerId: 9 }))
    h.lists.latest().succeed(orderPage([18]))
    h.track(store.observeOrder(17))
    h.details.latest().succeed(orderDetail())
    h.track(store.observeOrder(88))
    h.details.latest().succeed(orderDetail(88))
    h.track(requests.observeRequests())
    h.requestLists.latest().succeed(requestPage())
    h.track(requests.observeRequests())
    h.track(requests.observeRequests({ status: "registrada" }))
    h.requestLists.latest().succeed(requestPage())
    h.track(requests.observeRequest(41))
    h.requestDetails.latest().succeed(requestSummary())
    h.track(requests.observeRequest(99))
    h.requestDetails.latest().succeed(requestSummary(99))
    const seam = vi.spyOn(requests, "invalidateAfterOrderCreation")
    const pending = firstValueFrom(store.createOrder(createInput(), 8))
    expect(h.lists.calls).toHaveLength(2)
    expect(h.requestLists.calls).toHaveLength(2)
    h.writes.latest().succeed(orderDetail())
    expect((await pending).success).toBe(true)
    expect(seam).toHaveBeenCalledExactlyOnceWith(41)
    expect(h.lists.calls).toHaveLength(4)
    expect(h.details.calls.map(call => call.key)).toEqual([17, 88, 17])
    expect(h.requestLists.calls).toHaveLength(4)
    expect(h.requestDetails.calls.map(call => call.key)).toEqual([41, 99, 41])
    expect(store.selectOrders()).toMatchObject({ result: old, refreshing: true })
    expect(h.history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    expect(requests.writing()).toBe(false)
    expect(store.writing()).toBe(false)
  })

  it("expires inactive order/request entries without root reloads, and later observation performs GET only", async () => {
    const store = h.orders(),
      requests = h.requests()
    const list = h.track(store.observeOrders())
    h.lists.latest().succeed(orderPage())
    const detail = h.track(store.observeOrder(17))
    h.details.latest().succeed(orderDetail())
    const request = h.track(requests.observeRequests())
    h.requestLists.latest().succeed(requestPage())
    const linked = h.track(requests.observeRequest(41))
    h.requestDetails.latest().succeed(requestSummary())
    ;[list, detail, request, linked].forEach(sub => sub.unsubscribe())
    const pending = firstValueFrom(store.createOrder(createInput(), 8))
    h.writes.latest().succeed(orderDetail())
    await pending
    expect(store.selectOrders()).toMatchObject({ expires: 0, result: { total: 1 } })
    expect(store.selectOrder(17).expires).toBe(0)
    expect(requests.selectRequests().expires).toBe(0)
    expect(requests.selectRequest(41).expires).toBe(0)
    expect([
      h.lists.calls.length,
      h.details.calls.length,
      h.requestLists.calls.length,
      h.requestDetails.calls.length
    ]).toEqual([1, 1, 1, 1])
    h.track(store.observeOrders())
    expect(h.lists.calls).toHaveLength(2)
    expect(h.execute).toHaveBeenCalledTimes(1)
  })

  it("keeps confirmed success after GET failure and retries GET without replaying the write", async () => {
    const store = seed(),
      before = store.selectOrders().result
    const pending = firstValueFrom(store.createOrder(createInput(), 8))
    h.writes.latest().succeed(orderDetail())
    expect((await pending).success).toBe(true)
    expect(h.lists.calls).toHaveLength(2)
    h.lists.latest().fail("FORBIDDEN")
    expect(store.selectOrders()).toMatchObject({
      result: before,
      error: { code: "FORBIDDEN" },
      expires: 0,
      refreshing: false
    })
    h.track(store.observeOrders({}, true))
    expect(h.lists.calls).toHaveLength(3)
    h.lists.latest().succeed(orderPage([]))
    expect(store.selectOrders()).toMatchObject({
      result: { items: [], total: 0 },
      error: undefined
    })
    expect(h.execute).toHaveBeenCalledTimes(1)
    expect(h.history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
  })

  it("shares refresh cancellation between callers without a root-owned read subscription", async () => {
    const store = h.orders()
    const a = h.track(store.observeOrders()),
      b = h.track(store.observeOrders())
    h.lists.latest().succeed(orderPage())
    const pending = firstValueFrom(store.createOrder(createInput(), 8))
    h.writes.latest().succeed(orderDetail())
    await pending
    expect(h.lists.calls).toHaveLength(2)
    const refresh = h.lists.latest()
    a.unsubscribe()
    expect(refresh.cancelled).toBe(false)
    b.unsubscribe()
    expect(refresh.cancelled).toBe(true)
    expect(h.execute).toHaveBeenCalledTimes(1)
  })

  it("preserves renewal but replacement cancels old writes and fences their late success", () => {
    const store = seed(),
      delivered = vi.fn()
    h.track(store.createOrder(createInput(), 8), delivered)
    const call = h.writes.latest()
    h.session.next(createCaller())
    expect(call.cancelled).toBe(false)
    expect(store.writing()).toBe(true)
    h.session.next(createCaller(20))
    expect(call.cancelled).toBe(true)
    call.succeed(orderDetail())
    expect(delivered).not.toHaveBeenCalled()
    expect(store.writing()).toBe(false)
    expect(store.selectOrders().result).toBeUndefined()
    expectNoConfirmation()
  })

  it("fences expiry and settles pending without claiming backend rollback", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"))
    h.session.next(createCaller(19, Date.now() + 1000))
    const store = h.orders(),
      delivered = vi.fn()
    h.track(store.createOrder(createInput(), 8), delivered)
    const call = h.writes.latest()
    vi.advanceTimersByTime(1001)
    h.track(store.observeOrders()) // Public access checks deadline; no polling assumption.
    expect(call.cancelled).toBe(true)
    call.succeed(orderDetail())
    expect(delivered).not.toHaveBeenCalled()
    expect(store.writing()).toBe(false)
    expectNoConfirmation()
  })

  it("does not let a completed old-generation finalizer clear a new session's pending write", () => {
    const store = h.orders()
    h.track(store.createOrder(createInput(), 8), result => {
      if (!result.success) return
      h.session.next(createCaller(20))
      h.track(store.createOrder(createInput(), 8))
    })
    h.writes.latest().succeed(orderDetail())
    expect(h.writes.calls).toHaveLength(2)
    expect(store.writing()).toBe(true)
    h.writes.latest().succeed(orderDetail(18))
    expect(store.writing()).toBe(false)
    expect(h.history.invalidateCustomer).toHaveBeenCalledTimes(2)
  })

  it("checks session again between refresh callbacks before request/history invalidation", () => {
    const store = h.orders()
    h.track(store.observeOrders())
    h.lists.latest().succeed(orderPage())
    // A synchronous revalidation callback can replace the session mid-fan-out.
    vi.spyOn(h.lists, "execute").mockImplementationOnce(() => {
      h.session.next(createCaller(20))
      return EMPTY
    })
    h.track(store.createOrder(createInput(), 8))
    h.writes.latest().succeed(orderDetail())
    expectNoConfirmation()
    expect(store.writing()).toBe(false)
    expect(store.selectOrders().result).toBeUndefined()
  })

  it("destroys a root-owned store scope and cancels caller work without late invalidation", () => {
    const child = createEnvironmentInjector(
      [ServiceOrdersStore],
      TestBed.inject(EnvironmentInjector)
    )
    try {
      const store = child.get(ServiceOrdersStore),
        delivered = vi.fn()
      h.track(store.createOrder(createInput(), 8), delivered)
      const call = h.writes.latest()
      child.destroy()
      expect(call.cancelled).toBe(true)
      call.succeed(orderDetail())
      expect(delivered).not.toHaveBeenCalled()
      expectNoConfirmation()
    } finally {
      if (!child.destroyed) child.destroy()
    }
  })

  it.each(["server", "guest"] as const)(
    "dispatches no writes or lazy mutation dependencies for %s",
    mode => {
      if (mode === "server") TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
      else h.session.next(null)
      const store = h.orders(),
        delivered = vi.fn()
      h.track(store.createOrder(createInput(), 8), delivered)
      expect(delivered).not.toHaveBeenCalled()
      expect(h.writeFactory).not.toHaveBeenCalled()
      expect(h.historyFactory).not.toHaveBeenCalled()
      if (mode === "server") expect(h.authFactory).not.toHaveBeenCalled()
      expect(store.writing()).toBe(false)
    }
  )

  it("leaves read-only consumers independent of mutation/history dependency initialization", () => {
    const store = seed()
    h.track(store.observeOrder(17))
    h.details.latest().succeed(orderDetail())
    expect(store.selectOrders().result?.total).toBe(1)
    expect(store.selectOrder(17).result?.order.id).toBe(17)
    expect(h.writeFactory).not.toHaveBeenCalled()
    expect(h.historyFactory).not.toHaveBeenCalled()
    expect(store.writing()).toBe(false)
  })
})
