import { createEnvironmentInjector, EnvironmentInjector, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ServiceOrdersStore } from "./service-orders.store"
import {
  createCaller,
  createInput,
  requestPage,
  requestSummary
} from "./service-orders-create.store.testing"
import { orderDetail, orderPage, orderSummary } from "./service-orders.store.testing"
import { manualHarness, scheduleInput, teamInput } from "./service-orders-manual.testing"

// T6K S1/S2/S3/S6/S8/S9/S10: public caller actions and selector/effect assertions.
describe("manual order actions", () => {
  let h: ReturnType<typeof manualHarness>
  beforeEach(() => {
    h = manualHarness()
  })
  afterEach(() => {
    h.stop()
    vi.restoreAllMocks()
    vi.useRealTimers()
  })
  function seed() {
    const store = h.orders()
    h.track(store.observeOrders())
    h.lists.latest().succeed(orderPage())
    return store
  }
  for (const kind of ["schedule", "team"] as const) {
    const invoke = (store: InstanceType<typeof ServiceOrdersStore>, owner = 8, id = 17) =>
      kind === "schedule"
        ? store.scheduleOrder(id, scheduleInput(), owner)
        : store.replaceAssignments(id, teamInput(), owner)
    const calls = () => (kind === "schedule" ? h.schedules : h.teams)
    describe(kind, () => {
      it("is cold and initializes no unrelated write dependencies", async () => {
        const store = h.orders(),
          operation = invoke(store)
        expect(h.authFactory).not.toHaveBeenCalled()
        expect(h.scheduleFactory).not.toHaveBeenCalled()
        expect(h.teamFactory).not.toHaveBeenCalled()
        expect(store.writing()).toBe(false)
        const pending = firstValueFrom(operation)
        expect(calls().latest().key).toEqual({
          id: 17,
          params: kind === "schedule" ? scheduleInput() : teamInput()
        })
        expect(store.writing()).toBe(true)
        expect(h.writeFactory).not.toHaveBeenCalled()
        calls().latest().succeed(orderSummary())
        expect((await pending).success).toBe(true)
        expect(h.history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
        expect(store.writing()).toBe(false)
      })
      it.each([0, -1, NaN, 2147483648])(
        "rejects invalid owner/target %s without cache or write effects",
        async id => {
          const store = seed(),
            before = store.selectOrders()
          for (const operation of [invoke(store, id), invoke(store, 8, id)]) {
            expect(await firstValueFrom(operation)).toMatchObject({
              success: false,
              error: { code: "INVALID_DATA" }
            })
          }
          expect(calls().calls).toHaveLength(0)
          expect(store.selectOrders()).toEqual(before)
          expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
          expect(store.writing()).toBe(false)
        }
      )
      it.each(["owner", "target"] as const)(
        "rejects wrong returned %s before all invalidation",
        async field => {
          const store = seed(),
            before = store.selectOrders()
          const pending = firstValueFrom(invoke(store))
          const result = orderSummary(field === "target" ? 99 : 17)
          if (field === "owner") result.customerId = 9
          calls().latest().succeed(result)
          expect(await pending).toMatchObject({
            success: false,
            error: { code: "INVALID_RESPONSE" }
          })
          expect(store.selectOrders()).toEqual(before)
          expect(h.lists.calls).toHaveLength(1)
          expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
        }
      )
      it("shares the gate with create and the other manual action", async () => {
        const store = h.orders(),
          pending = firstValueFrom(invoke(store))
        const rejected: Observable<unknown>[] = [
          store.createOrder(createInput(), 8),
          store.scheduleOrder(17, scheduleInput(), 8),
          store.replaceAssignments(17, teamInput(), 8)
        ]
        for (const operation of rejected)
          expect(await firstValueFrom(operation)).toMatchObject({
            success: false,
            error: { code: "CONFLICT" }
          })
        expect(h.execute).not.toHaveBeenCalled()
        expect(h.schedules.calls.length + h.teams.calls.length).toBe(1)
        calls().latest().succeed(orderSummary())
        await pending
        expect(store.writing()).toBe(false)
      })
      it.each(["result", "throw", "empty"] as const)(
        "settles safe %s failures with no false invalidation or replay",
        async mode => {
          const store = seed(),
            before = store.selectOrders(),
            pending = firstValueFrom(invoke(store))
          if (mode === "result") calls().latest().fail("FORBIDDEN")
          if (mode === "throw") calls().latest().throwError(new Error("private raw detail"))
          if (mode === "empty") calls().latest().completeEmpty()
          const result = await pending
          expect(result).toMatchObject({
            success: false,
            error: {
              code:
                mode === "result" ? "FORBIDDEN" : mode === "empty" ? "INVALID_RESPONSE" : "UNKNOWN"
            }
          })
          if (!result.success) expect(result.error.message).not.toContain("private raw detail")
          expect(store.selectOrders()).toEqual(before)
          expect(h.lists.calls).toHaveLength(1)
          expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
          expect(store.writing()).toBe(false)
        }
      )
      it("refreshes all active order pages/target detail exactly once but never linked requests", async () => {
        const store = seed(),
          stale = store.selectOrders().result
        h.track(store.observeOrders())
        h.track(store.observeOrders({ customerId: 9 }))
        h.lists.latest().succeed(orderPage([18]))
        h.track(store.observeOrder(17))
        h.details.latest().succeed(orderDetail())
        h.track(store.observeOrder(88))
        h.details.latest().succeed(orderDetail(88))
        const requests = h.requests()
        h.track(requests.observeRequests())
        h.requestLists.latest().succeed(requestPage())
        h.track(requests.observeRequest(41))
        h.requestDetails.latest().succeed(requestSummary())
        const pending = firstValueFrom(invoke(store))
        calls().latest().succeed(orderSummary())
        await pending
        expect(h.lists.calls).toHaveLength(4)
        expect(h.details.calls.map(call => call.key)).toEqual([17, 88, 17])
        expect(h.requestLists.calls).toHaveLength(1)
        expect(h.requestDetails.calls).toHaveLength(1)
        expect(store.selectOrders()).toMatchObject({ result: stale, refreshing: true })
        h.lists.latest().fail("FORBIDDEN")
        expect(calls().calls).toHaveLength(1)
        expect(h.history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
      })
      it("expires inactive resources without orphan GET subscriptions", async () => {
        const store = h.orders(),
          list = h.track(store.observeOrders())
        h.lists.latest().succeed(orderPage())
        const detail = h.track(store.observeOrder(17))
        h.details.latest().succeed(orderDetail())
        list.unsubscribe()
        detail.unsubscribe()
        const pending = firstValueFrom(invoke(store))
        calls().latest().succeed(orderSummary())
        await pending
        expect(store.selectOrders()).toMatchObject({ expires: 0, result: { total: 1 } })
        expect(store.selectOrder(17).expires).toBe(0)
        expect(h.lists.calls).toHaveLength(1)
        expect(h.details.calls).toHaveLength(1)
      })
      it("cancels caller work, releases pending and fences late success", () => {
        const store = seed(),
          before = store.selectOrders(),
          delivered = vi.fn()
        const sub = h.track(invoke(store), delivered),
          call = calls().latest()
        sub.unsubscribe()
        expect(call.cancelled).toBe(true)
        call.succeed(orderSummary())
        expect(delivered).not.toHaveBeenCalled()
        expect(store.writing()).toBe(false)
        expect(store.selectOrders()).toEqual(before)
        expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
      })
      it("preserves renewal; replacement cancels and fences old-generation success", () => {
        const store = h.orders(),
          delivered = vi.fn()
        h.track(invoke(store), delivered)
        const call = calls().latest()
        h.session.next(createCaller())
        expect(call.cancelled).toBe(false)
        h.session.next(createCaller(20))
        expect(call.cancelled).toBe(true)
        call.succeed(orderSummary())
        expect(delivered).not.toHaveBeenCalled()
        expect(store.writing()).toBe(false)
        expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
      })
      it("keeps a new-generation pending write when an old finalizer runs", () => {
        const store = h.orders()
        h.track(invoke(store), result => {
          if (result.success) {
            h.session.next(createCaller(20))
            h.track(invoke(store))
          }
        })
        calls().latest().succeed(orderSummary())
        expect(calls().calls).toHaveLength(2)
        expect(store.writing()).toBe(true)
        calls().latest().succeed(orderSummary())
        expect(store.writing()).toBe(false)
      })
      it("fences fixed-deadline expiry without history or false success", () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-03-01T00:00:00Z"))
        h.session.next(createCaller(19, Date.now() + 1000))
        const store = h.orders(),
          delivered = vi.fn()
        h.track(invoke(store), delivered)
        const call = calls().latest()
        vi.advanceTimersByTime(1001)
        h.track(store.observeOrders())
        expect(call.cancelled).toBe(true)
        call.succeed(orderSummary())
        expect(delivered).not.toHaveBeenCalled()
        expect(store.writing()).toBe(false)
        expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
      })
      it("normalizes a synchronous use-case exception and releases the shared gate", async () => {
        const execute = kind === "schedule" ? h.scheduleExecute : h.teamExecute
        execute.mockImplementationOnce(() => {
          throw new Error("private backend detail")
        })
        const store = h.orders(),
          result = await firstValueFrom(invoke(store))
        expect(result).toMatchObject({ success: false, error: { code: "UNKNOWN" } })
        if (!result.success) expect(result.error.message).not.toContain("private backend detail")
        expect(store.writing()).toBe(false)
        expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
      })
      it("cancels on root scope destruction", () => {
        const child = createEnvironmentInjector(
          [ServiceOrdersStore],
          TestBed.inject(EnvironmentInjector)
        )
        const store = child.get(ServiceOrdersStore),
          delivered = vi.fn()
        h.track(invoke(store), delivered)
        const call = calls().latest()
        child.destroy()
        expect(call.cancelled).toBe(true)
        call.succeed(orderSummary())
        expect(delivered).not.toHaveBeenCalled()
        expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
      })
      it.each(["server", "guest"] as const)(
        "initializes no manual/history dependencies for %s",
        mode => {
          if (mode === "server") TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
          else h.session.next(null)
          const store = h.orders(),
            delivered = vi.fn()
          h.track(invoke(store), delivered)
          expect(delivered).not.toHaveBeenCalled()
          expect(h.scheduleFactory).not.toHaveBeenCalled()
          expect(h.teamFactory).not.toHaveBeenCalled()
          expect(h.historyFactory).not.toHaveBeenCalled()
          if (mode === "server") expect(h.authFactory).not.toHaveBeenCalled()
          expect(store.writing()).toBe(false)
        }
      )
    })
  }
  it("detaches nested team and literal schedule payloads at call time", async () => {
    const store = h.orders(),
      team = teamInput(),
      schedule = scheduleInput()
    const teamOperation = store.replaceAssignments(17, team, 8)
    const scheduleOperation = store.scheduleOrder(17, schedule, 8)
    team.assignments[0].staffId = 99
    team.assignments.push({ staffId: 100, role: "APOYO" })
    schedule.startTime = "00:00"
    schedule.date = "2000-01-01"
    const first = firstValueFrom(teamOperation)
    expect(h.teams.latest().key.params).toEqual(teamInput())
    h.teams.latest().succeed(orderSummary())
    await first
    const second = firstValueFrom(scheduleOperation)
    expect(h.schedules.latest().key.params).toEqual(scheduleInput())
    h.schedules.latest().succeed(orderSummary())
    await second
  })
  it("captures getter failures without synchronous throw or dispatch", async () => {
    const store = h.orders(),
      input = scheduleInput()
    Object.defineProperty(input, "date", {
      get: () => {
        throw new Error("private")
      }
    })
    expect(await firstValueFrom(store.scheduleOrder(17, input, 8))).toMatchObject({
      success: false,
      error: { code: "INVALID_DATA" }
    })
    expect(h.scheduleExecute).not.toHaveBeenCalled()
    expect(h.history.invalidateCustomer).not.toHaveBeenCalled()
  })
})
