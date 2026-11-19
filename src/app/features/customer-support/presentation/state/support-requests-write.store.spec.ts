import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable, Subscription } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { CustomerSupportError } from "../../domain/errors/customer-support.error"
import { SupportDetail } from "../../domain/models/support-views"
import { CreateSupportRequestParams } from "../../domain/params/customer-support.params"
import { SupportRequestsStore } from "./support-requests.store"
import {
  addSupportMessageParams,
  changeSupportStateParams,
  createSupportRequestParams,
  createSupportWriteHarness,
  supportCaller,
  supportDetail,
  supportPage
} from "./support-requests.store.testing"

type WriteKind = "create" | "message" | "state"
type WriteResult = Result<SupportDetail, CustomerSupportError>

/**
 * T8/S10/S11: the root store is the only place a consumer triggers a write, the
 * three actions share one pending gate, and only a confirmed current-generation
 * success invalidates cached reads. Doubles replace application ports only.
 */
describe("SupportRequestsStore write coordination", () => {
  let h: ReturnType<typeof createSupportWriteHarness>

  beforeEach(() => {
    h = createSupportWriteHarness()
  })

  afterEach(() => {
    try {
      h.stop()
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  function action(store: InstanceType<typeof SupportRequestsStore>, kind: WriteKind) {
    if (kind === "create") return store.createRequest(createSupportRequestParams())
    if (kind === "message") return store.addMessage(5, addSupportMessageParams())
    return store.changeState(5, changeSupportStateParams())
  }
  function writes(kind: WriteKind) {
    if (kind === "create") return h.create.calls
    if (kind === "message") return h.messages.calls
    return h.states.calls
  }
  function pendingWrite(kind: WriteKind) {
    if (kind === "create") return h.create.latest()
    if (kind === "message") return h.messages.latest()
    return h.states.latest()
  }
  const writeCalls = () => h.create.calls.length + h.messages.calls.length + h.states.calls.length
  // Two verified page variants plus the affected detail (id 5), all observed here.
  function seed() {
    const store = h.store()
    const page = h.track(store.observeRequests())
    h.pages.latest().succeed(supportPage([5]))
    const filtered = h.track(store.observeRequests({ state: "RECIBIDA" }))
    h.pages.latest().succeed(supportPage([5], 0, 20, 1))
    const detail = h.track(store.observeRequest(5))
    h.details.latest().succeed(supportDetail(5))
    return { page, filtered, detail }
  }
  function inactive(seeded: Record<string, Subscription>, keep: (string | undefined)[] = []) {
    Object.entries(seeded).forEach(([name, subscription]) => {
      if (!keep.includes(name)) subscription.unsubscribe()
    })
  }

  describe("one shared pending gate", () => {
    it.each(["create", "message", "state"] as const)(
      "%s blocks the other two actions and dispatches a single write",
      async kind => {
        const store = h.store()
        const pending = firstValueFrom(action(store, kind))
        expect(store.writing()).toBe(true)
        const others = (["create", "message", "state"] as const).filter(other => other !== kind)
        for (const other of others)
          expect(await firstValueFrom(action(store, other))).toMatchObject({
            success: false,
            error: { code: "CONFLICT" }
          })
        // The gate is per store: no duplicate POST and no cross-action transaction.
        expect(writeCalls()).toBe(1)
        expect(store.writing()).toBe(true)
        pendingWrite(kind).succeed(supportDetail(5))
        expect(await pending).toMatchObject({ success: true })
        expect(store.writing()).toBe(false)
        // The gate reopens once the write settles.
        h.track(action(store, others[0] ?? "message"))
        expect(writeCalls()).toBe(2)
      }
    )

    it.each(["create", "message", "state"] as const)(
      "%s refuses an identical duplicate submit while pending",
      async kind => {
        const store = h.store()
        h.track(action(store, kind))
        expect(await firstValueFrom(action(store, kind))).toMatchObject({
          success: false,
          error: { code: "CONFLICT" }
        })
        expect(writes(kind)).toHaveLength(1)
        expect(writeCalls()).toBe(1)
      }
    )

    it("keeps the gate across a credential renewal of the same session", async () => {
      const store = h.store()
      const pending = firstValueFrom(action(store, "create"))
      const call = h.create.latest()
      // Same id, email and fixed deadline: a renewal, not a replacement.
      h.session.next(supportCaller(19, 4102444800000, "Renewed label"))
      expect(call.cancelled).toBe(false)
      expect(store.writing()).toBe(true)
      expect(await firstValueFrom(action(store, "create"))).toMatchObject({
        success: false,
        error: { code: "CONFLICT" }
      })
      expect(h.create.calls).toHaveLength(1)
      call.succeed(supportDetail(5))
      expect(await pending).toMatchObject({ success: true })
      expect(store.writing()).toBe(false)
    })
  })

  describe("confirmed success invalidates cached reads", () => {
    it.each(["create", "message", "state"] as const)(
      "%s expires every page variant and the affected detail",
      async kind => {
        vi.spyOn(Date, "now").mockReturnValue(1000)
        const store = h.store()
        inactive(seed())
        const before = {
          all: store.selectRequests().result,
          filtered: store.selectRequests({ state: "RECIBIDA" }).result,
          detail: store.selectRequest(5).result
        }
        expect(store.selectRequests().expires).toBe(31000)
        const pending = firstValueFrom(action(store, kind))
        pendingWrite(kind).succeed(supportDetail(5))
        expect(await pending).toMatchObject({ success: true })
        expect(store.selectRequests()).toMatchObject({ result: before.all, expires: 0 })
        expect(store.selectRequests({ state: "RECIBIDA" })).toMatchObject({
          result: before.filtered,
          expires: 0
        })
        expect(store.selectRequest(5)).toMatchObject({ result: before.detail, expires: 0 })
        // Inactive entries only expire: no root refresh for the two pages or the detail.
        expect(h.pages.calls).toHaveLength(2)
        expect(h.details.calls).toHaveLength(1)
        expect(writeCalls()).toBe(1)
      }
    )

    it("re-reads an observed key once per invalidation and only expires an unobserved one", async () => {
      vi.spyOn(Date, "now").mockReturnValue(1000)
      const store = h.store()
      const seeded = seed()
      inactive(seeded, ["page"])
      // Two observers of the same page still share one invalidated flight.
      h.track(store.observeRequests())
      expect(h.pages.calls).toHaveLength(2)
      const pending = firstValueFrom(store.changeState(5, changeSupportStateParams()))
      h.states.latest().succeed(supportDetail(5))
      expect(await pending).toMatchObject({ success: true })
      expect(h.pages.calls).toHaveLength(3)
      // The unobserved variant and the unobserved detail never self-refresh.
      expect(store.selectRequests({ state: "RECIBIDA" })).toMatchObject({ expires: 0 })
      expect(store.selectRequest(5)).toMatchObject({ expires: 0 })
      expect(h.details.calls).toHaveLength(1)
      h.pages.latest().succeed(supportPage([5]))
      expect(store.selectRequests()).toMatchObject({ expires: 31000, error: undefined })
    })

    it.each(["create", "message", "state"] as const)(
      "%s does not invalidate anything when the write fails",
      async kind => {
        vi.spyOn(Date, "now").mockReturnValue(1000)
        const store = h.store()
        inactive(seed())
        const before = {
          all: store.selectRequests(),
          filtered: store.selectRequests({ state: "RECIBIDA" }),
          detail: store.selectRequest(5)
        }
        const pending = firstValueFrom(action(store, kind))
        pendingWrite(kind).fail("FORBIDDEN")
        expect(await pending).toMatchObject({ success: false, error: { code: "FORBIDDEN" } })
        expect(store.writing()).toBe(false)
        expect(store.selectRequests()).toEqual(before.all)
        expect(store.selectRequests({ state: "RECIBIDA" })).toEqual(before.filtered)
        expect(store.selectRequest(5)).toEqual(before.detail)
        expect(h.pages.calls).toHaveLength(2)
        expect(h.details.calls).toHaveLength(1)
      }
    )
  })

  describe("a failed post-write re-read", () => {
    it.each(["create", "message", "state"] as const)(
      "%s keeps verified data after a failed re-read and never replays the write",
      async kind => {
        vi.spyOn(Date, "now").mockReturnValue(1000)
        const store = h.store()
        inactive(seed(), ["page"])
        const verified = store.selectRequests().result
        const pending = firstValueFrom(action(store, kind))
        pendingWrite(kind).succeed(supportDetail(5))
        expect(await pending).toMatchObject({ success: true })
        expect(h.pages.calls).toHaveLength(3)
        h.pages.latest().fail("FORBIDDEN")
        expect(store.selectRequests()).toMatchObject({
          result: verified,
          error: { code: "FORBIDDEN" },
          expires: 0
        })
        // An explicit retry is a GET; the confirmed write is never replayed.
        h.track(store.observeRequests({}, true))
        expect(h.pages.calls).toHaveLength(4)
        h.pages.latest().succeed(supportPage([5]))
        expect(store.selectRequests()).toMatchObject({ result: supportPage([5]), error: undefined })
        expect(writeCalls()).toBe(1)
      }
    )
  })

  describe("rejected and malformed write outcomes", () => {
    it("rejects invalid targets and malformed params before dispatching", async () => {
      const store = h.store()
      expect(await firstValueFrom(store.addMessage(0, addSupportMessageParams()))).toMatchObject({
        success: false,
        error: { code: "VALIDATION" }
      })
      expect(await firstValueFrom(store.changeState(-1, changeSupportStateParams()))).toMatchObject(
        { success: false, error: { code: "VALIDATION" } }
      )
      expect(
        await firstValueFrom(store.createRequest(null as unknown as CreateSupportRequestParams))
      ).toMatchObject({ success: false, error: { code: "VALIDATION" } })
      expect(writeCalls()).toBe(0)
      expect(store.writing()).toBe(false)
    })

    it("refuses an answer for another record and still releases the gate", async () => {
      vi.spyOn(Date, "now").mockReturnValue(1000)
      const store = h.store()
      inactive(seed())
      const pending = firstValueFrom(store.addMessage(5, addSupportMessageParams()))
      h.messages.latest().succeed(supportDetail(9))
      expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
      expect(store.writing()).toBe(false)
      // The mismatched answer invalidates nothing and creates no verified entry.
      expect(store.selectRequest(9).result).toBeUndefined()
      expect(store.selectRequest(5).expires).toBe(31000)
      expect(h.pages.calls).toHaveLength(2)
      expect(h.details.calls).toHaveLength(1)
    })

    it("settles an empty write completion without inventing success or invalidation", async () => {
      vi.spyOn(Date, "now").mockReturnValue(1000)
      const store = h.store()
      inactive(seed())
      const pending = firstValueFrom(store.createRequest(createSupportRequestParams()))
      h.create.latest().completeEmpty()
      expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
      expect(store.writing()).toBe(false)
      expect(store.selectRequests().expires).toBe(31000)
      expect(h.pages.calls).toHaveLength(2)
    })
  })

  describe("session fencing and SSR", () => {
    it.each(["replacement", "logout", "expiry", "destroy"] as const)(
      "%s fences a late completion so it neither mutates state nor invalidates",
      async fence => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-03-01T00:00:00Z"))
        if (fence === "expiry") h.session.next(supportCaller(19, Date.now() + 1000))
        const store = h.store()
        inactive(seed())
        const delivered = vi.fn()
        h.track(store.createRequest(createSupportRequestParams()), delivered)
        const call = h.create.latest()
        if (fence === "replacement") h.session.next(supportCaller(20))
        else if (fence === "logout") h.session.next(null)
        else if (fence === "expiry") {
          vi.advanceTimersByTime(1001)
          h.track(store.observeRequests())
        } else TestBed.resetTestingModule()
        expect(call.cancelled).toBe(true)
        call.succeed(supportDetail(5))
        expect(delivered).not.toHaveBeenCalled()
        expect(store.writing()).toBe(false)
        // Neither a mutation nor an invalidation refresh comes out of the old generation.
        expect(store.selectRequests().result).toBeUndefined()
        expect(store.selectRequest(5).result).toBeUndefined()
        expect(h.pages.calls).toHaveLength(2)
        expect(h.details.calls).toHaveLength(1)
        expect(writeCalls()).toBe(1)
      }
    )

    it.each(["server", "guest", "expired"] as const)("%s dispatches no write", async kind => {
      if (kind === "server") TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
      else if (kind === "guest") h.session.next(null)
      else h.session.next(supportCaller(19, Date.now() - 1))
      const store = h.store()
      const delivered = vi.fn()
      const operations: Observable<WriteResult>[] = [
        store.createRequest(createSupportRequestParams()),
        store.addMessage(5, addSupportMessageParams()),
        store.changeState(5, changeSupportStateParams())
      ]
      const subscriptions = operations.map(operation => operation.subscribe(delivered))
      expect(subscriptions.every(subscription => subscription.closed)).toBe(true)
      expect(delivered).not.toHaveBeenCalled()
      expect(writeCalls()).toBe(0)
      expect(store.writing()).toBe(false)
      if (kind === "server") {
        // Failing closed never initializes auth or storage during SSR.
        expect(h.authFactory).not.toHaveBeenCalled()
        expect(h.sessionFactory).not.toHaveBeenCalled()
      }
    })

    it("cancels a caller's stream without inventing a result or reversing the write", () => {
      vi.spyOn(Date, "now").mockReturnValue(1000)
      const store = h.store()
      inactive(seed())
      const before = {
        all: store.selectRequests(),
        detail: store.selectRequest(5)
      }
      const delivered = vi.fn()
      const subscription = store.createRequest(createSupportRequestParams()).subscribe(delivered)
      const call = h.create.latest()
      subscription.unsubscribe()
      expect(call.cancelled).toBe(true)
      expect(delivered).not.toHaveBeenCalled()
      expect(store.writing()).toBe(false)
      // Cancellation does not claim to undo the dispatched write or refresh reads.
      expect(store.selectRequests()).toEqual(before.all)
      expect(store.selectRequest(5)).toEqual(before.detail)
      expect(h.pages.calls).toHaveLength(2)
    })
  })
})
