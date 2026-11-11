import { signal } from "@angular/core"
import { Observable, Subject, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { createKeyedReads, KeyedEntry, KeyedReadsOptions, keyedState } from "./keyed-reads"

interface Query {
  offset?: number
  limit?: number
}

interface Page {
  offset: number
  limit: number
  items: string[]
}

const page = (offset = 0, limit = 20, items = ["a"]): Page => ({ offset, limit, items })
const cacheKey = (query: Query) => JSON.stringify([query.offset ?? 0, query.limit ?? 20])

function setup(overrides: Partial<KeyedReadsOptions<Query, Page, string>> = {}) {
  const entries = signal<Record<string, KeyedEntry<Query, Page, string>>>({})
  const session = { allowed: true, generation: 0, cancelled: new Subject<void>() }
  const source = vi.fn<
    (query: Query, context: { effective: boolean }) => Observable<Result<Page, string>>
  >(query => of(Result.success(page(query.offset ?? 0, query.limit ?? 20))))
  const reads = createKeyedReads<Query, Page, string>({
    key: cacheKey,
    normalize: query => ({ offset: query.offset ?? 0, limit: query.limit ?? 20 }),
    request: (query, context) => source(query, context),
    state: keyedState(
      () => entries(),
      next => entries.set(next),
      () => entries
    ),
    scope: {
      check: () => session.allowed,
      generation: () => session.generation,
      cancelled$: session.cancelled.asObservable()
    },
    ttl: 1000,
    normalizeError: () => "unexpected",
    overflow: () => "overflow",
    ...overrides
  })
  return {
    reads,
    source,
    entries: () => entries(),
    session,
    deny: () => {
      session.allowed = false
    },
    changeSession: () => {
      session.generation++
      session.cancelled.next()
      reads.reset()
    }
  }
}

describe("keyed read registry", () => {
  it("keeps the cache key from the normalized query while adopting the effective one", () => {
    const h = setup({
      adopt: (query, data) => ({ ...query, offset: data.offset, limit: data.limit })
    })
    h.source.mockReturnValue(of(Result.success(page(20, 20))))
    h.reads.read({ offset: 40, limit: 20 }).subscribe()
    expect(h.reads.keys).toEqual([cacheKey({ offset: 40, limit: 20 })])
    expect(h.reads.select({ offset: 40 })?.query).toEqual({ offset: 20, limit: 20 })
    h.reads.read({ offset: 40, limit: 20 }).subscribe()
    expect(h.source).toHaveBeenCalledTimes(1)
    h.reads.read({ offset: 40, limit: 20 }, true).subscribe()
    expect(h.source).toHaveBeenLastCalledWith({ offset: 20, limit: 20 }, { effective: true })
    h.reads.read({ offset: 20, limit: 20 }).subscribe()
    expect(h.source).toHaveBeenCalledTimes(3)
  })

  it("renews freshness only on success", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    try {
      const h = setup({ ttl: 100 })
      h.source.mockReturnValue(of(Result.success(page())))
      h.reads.read({}).subscribe()
      expect(h.reads.select({})?.expires).toBe(1100)
      now.mockReturnValue(1099)
      h.reads.read({}).subscribe()
      expect(h.source).toHaveBeenCalledTimes(1)
      now.mockReturnValue(1100)
      h.source.mockReturnValue(of(Result.failure("down")))
      h.reads.read({}).subscribe()
      expect(h.source).toHaveBeenCalledTimes(2)
      expect(h.reads.select({})).toMatchObject({ result: page(), error: "down", expires: 1100 })
      h.reads.read({}).subscribe()
      expect(h.source).toHaveBeenCalledTimes(3)
      now.mockReturnValue(1200)
      h.source.mockReturnValue(of(Result.success(page(0, 20, ["b"]))))
      h.reads.read({}).subscribe()
      expect(h.reads.select({})?.expires).toBe(1300)
    } finally {
      now.mockRestore()
    }
  })

  it("evicts the oldest unpinned entry and never a pinned or pending one", () => {
    const h = setup({ maxEntries: 2 })
    h.reads.read({ offset: 0 }).subscribe()
    h.reads.read({ offset: 20 }).subscribe()
    const pinned = h.reads.observe({ offset: 20 }).subscribe()
    h.reads.read({ offset: 40 }).subscribe()
    expect(h.reads.keys).toEqual([cacheKey({ offset: 20 }), cacheKey({ offset: 40 })])
    expect(h.reads.select({ offset: 0 })).toBeUndefined()
    pinned.unsubscribe()
  })

  it("reflects admitted keys and drops evicted or reset ones", () => {
    const h = setup({ maxEntries: 2 })
    expect(h.reads.keys).toEqual([])
    h.reads.read({ offset: 0 }).subscribe()
    h.reads.read({ offset: 20 }).subscribe()
    expect(h.reads.keys).toEqual([cacheKey({ offset: 0 }), cacheKey({ offset: 20 })])
    h.reads.read({ offset: 40 }).subscribe()
    expect(h.reads.keys).toEqual([cacheKey({ offset: 20 }), cacheKey({ offset: 40 })])
    h.reads.reset()
    expect(h.reads.keys).toEqual([])
  })

  it("returns a failed result instead of throwing when no entry can be evicted", () => {
    const h = setup({ maxEntries: 2 })
    const first = h.reads.observe({ offset: 0 }).subscribe()
    const second = h.reads.observe({ offset: 20 }).subscribe()
    const received: Result<Page, string>[] = []
    expect(() =>
      h.reads.read({ offset: 40 }).subscribe(result => received.push(result))
    ).not.toThrow()
    expect(received).toEqual([Result.failure("overflow")])
    expect(h.reads.keys).toEqual([cacheKey({ offset: 0 }), cacheKey({ offset: 20 })])
    first.unsubscribe()
    second.unsubscribe()
  })

  it("rejects observation beyond the active key budget with the same failure", () => {
    const h = setup({ maxEntries: 1 })
    const first = h.reads.observe({ offset: 0 }).subscribe()
    const received: Result<Page, string>[] = []
    expect(() =>
      h.reads.observe({ offset: 20 }).subscribe(result => received.push(result))
    ).not.toThrow()
    expect(received).toEqual([Result.failure("overflow")])
    expect(h.reads.keys).toEqual([cacheKey({ offset: 0 })])
    first.unsubscribe()
  })

  it("shares one in-flight request between concurrent readers", () => {
    const h = setup()
    const flight = new Subject<Result<Page, string>>()
    h.source.mockReturnValue(flight)
    const first = vi.fn(),
      second = vi.fn()
    h.reads.read({}).subscribe(first)
    h.reads.read({}).subscribe(second)
    expect(h.source).toHaveBeenCalledTimes(1)
    flight.next(Result.success(page()))
    flight.complete()
    expect(first).toHaveBeenCalledWith(Result.success(page()))
    expect(second).toHaveBeenCalledWith(Result.success(page()))
  })

  it("refreshes an observed entry through one shared flight per mutation", () => {
    const h = setup()
    const first = vi.fn(),
      second = vi.fn()
    h.reads.observe({ offset: 0 }).subscribe(first)
    h.reads.observe({ offset: 0 }).subscribe(second)
    expect(h.source).toHaveBeenCalledTimes(1)
    const flight = new Subject<Result<Page, string>>()
    h.source.mockReturnValue(flight)
    h.reads.markMutated()
    expect(h.source).toHaveBeenCalledTimes(2)
    expect(h.reads.select({ offset: 0 })).toMatchObject({ refreshing: true, loading: false })
    flight.next(Result.failure("down"))
    flight.complete()
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(2)
    expect(h.reads.select({ offset: 0 })).toMatchObject({
      result: page(0, 20),
      error: "down",
      refreshing: false
    })
  })

  it("delivers a synchronous refresh failure once to every observer", () => {
    const h = setup()
    const first = vi.fn(),
      second = vi.fn()
    h.reads.observe({ offset: 0 }).subscribe(first)
    h.reads.observe({ offset: 0 }).subscribe(second)
    h.source.mockReturnValue(of(Result.failure("down")))
    h.reads.markMutated()
    expect(first).toHaveBeenCalledTimes(2)
    expect(second).toHaveBeenCalledTimes(2)
    expect(first).toHaveBeenLastCalledWith(Result.failure("down"))
    expect(second).toHaveBeenLastCalledWith(Result.failure("down"))
    expect(h.reads.select({ offset: 0 })).toMatchObject({ error: "down", result: page() })
  })

  it("invalidates and refreshes only the entries a mutation filter matches", () => {
    const h = setup()
    const kept = vi.fn(),
      targeted = vi.fn()
    h.reads.observe({ offset: 0 }).subscribe(kept)
    h.reads.observe({ offset: 20 }).subscribe(targeted)
    h.reads.markMutated(entry => entry.query.offset === 20)
    expect(h.source.mock.calls.filter(([query]) => query.offset === 0)).toHaveLength(1)
    expect(h.source.mock.calls.filter(([query]) => query.offset === 20)).toHaveLength(2)
    expect(kept).toHaveBeenCalledTimes(1)
    expect(targeted).toHaveBeenCalledTimes(2)
  })

  it("invalidates a filter-matched entry without refreshing an unobserved key", () => {
    const h = setup()
    h.reads.read({ offset: 0 }).subscribe()
    h.reads.read({ offset: 20 }).subscribe()
    expect(h.source).toHaveBeenCalledTimes(2)
    h.reads.markMutated(entry => entry.query.offset === 20)
    expect(h.source).toHaveBeenCalledTimes(2)
    expect(h.reads.select({ offset: 20 })).toMatchObject({
      result: page(20, 20),
      expires: 0,
      refreshing: false
    })
    expect(h.reads.select({ offset: 0 })?.expires).toBeGreaterThan(0)
  })

  it("refetches an invalidated unobserved entry instead of reading it as fresh", () => {
    const h = setup()
    h.reads.read({ offset: 20 }).subscribe()
    h.reads.markMutated(entry => entry.query.offset === 20)
    const flight = new Subject<Result<Page, string>>()
    h.source.mockReturnValue(flight)
    const observed = h.reads.observe({ offset: 20 }).subscribe()
    expect(h.source).toHaveBeenCalledTimes(2)
    expect(h.reads.select({ offset: 20 })).toMatchObject({
      result: page(20, 20),
      loading: false,
      refreshing: true,
      expires: 0
    })
    flight.next(Result.success(page(20, 20, ["fresh"])))
    flight.complete()
    expect(h.reads.select({ offset: 20 })).toMatchObject({
      result: page(20, 20, ["fresh"]),
      refreshing: false
    })
    observed.unsubscribe()
  })

  it("cancels session-old flights and fences late commits", () => {
    const h = setup()
    const flight = new Subject<Result<Page, string>>()
    h.source.mockReturnValue(flight)
    h.reads.observe({}).subscribe()
    expect(flight.observed).toBe(true)
    h.changeSession()
    expect(flight.observed).toBe(false)
    flight.next(Result.success(page()))
    expect(h.reads.keys).toEqual([])
    expect(h.reads.select({})).toBeUndefined()
    const stale = new Subject<Result<Page, string>>()
    h.source.mockReturnValue(stale)
    h.reads.read({}).subscribe()
    h.session.generation++
    stale.next(Result.success(page()))
    stale.complete()
    expect(h.reads.select({})).toMatchObject({ result: undefined, expires: 0 })
  })

  it("resets entries, keys and pending flights without resurrecting them", () => {
    const h = setup()
    const flight = new Subject<Result<Page, string>>()
    h.source.mockReturnValue(flight)
    h.reads.read({ offset: 0 }).subscribe()
    const pinned = h.reads.observe({ offset: 20 }).subscribe()
    expect(h.reads.keys).toEqual([cacheKey({ offset: 0 }), cacheKey({ offset: 20 })])
    expect(flight.observed).toBe(true)
    h.reads.reset()
    expect(h.reads.keys).toEqual([])
    expect(h.entries()).toEqual({})
    expect(h.reads.select({ offset: 0 })).toBeUndefined()
    expect(h.reads.select({ offset: 20 })).toBeUndefined()
    expect(flight.observed).toBe(false)
    flight.next(Result.success(page()))
    flight.complete()
    expect(h.reads.keys).toEqual([])
    expect(h.entries()).toEqual({})
    pinned.unsubscribe()
  })

  it("returns an empty stream without a session", () => {
    const h = setup()
    h.deny()
    const values: unknown[] = []
    h.reads.read({}).subscribe({
      next: value => values.push(value),
      complete: () => values.push("complete")
    })
    expect(values).toEqual(["complete"])
    expect(h.source).not.toHaveBeenCalled()
    expect(h.reads.keys).toEqual([])
  })

  it("returns a failed result without a session in failure mode", () => {
    const h = setup({ noSession: "failure" })
    h.deny()
    const received: Result<Page, string>[] = []
    h.reads.read({}).subscribe(result => received.push(result))
    expect(received).toEqual([Result.failure("overflow")])
    expect(h.source).not.toHaveBeenCalled()
    expect(h.reads.keys).toEqual([])
  })

  it("marks pending state before a delayed read starts", () => {
    vi.useFakeTimers()
    try {
      const h = setup()
      const received = vi.fn()
      h.reads.observe({}, { delayMs: 50 }).subscribe(received)
      expect(h.reads.select({})).toMatchObject({ loading: true, refreshing: false })
      expect(h.source).not.toHaveBeenCalled()
      vi.advanceTimersByTime(50)
      expect(h.source).toHaveBeenCalledTimes(1)
      expect(received).toHaveBeenCalledWith(Result.success(page()))
      expect(h.reads.select({})).toMatchObject({ loading: false, refreshing: false })
    } finally {
      vi.useRealTimers()
    }
  })

  it("selects the normalized entry and nothing for an unknown query", () => {
    const h = setup()
    h.reads.read({ offset: 0 }).subscribe()
    expect(h.reads.select({ offset: 0 })).toBe(h.entries()[cacheKey({ offset: 0 })])
    expect(h.reads.select({ offset: 0, limit: 20 })?.query).toEqual({ offset: 0, limit: 20 })
    expect(h.reads.select({ offset: 20 })).toBeUndefined()
  })

  it("selects the current entry for a signal query", () => {
    const h = setup()
    const query = signal<Query>({ offset: 0 })
    const selection = h.reads.selectReactive(query)
    expect(selection()).toBeUndefined()
    h.reads.read({ offset: 0 }).subscribe()
    expect(selection()?.query).toEqual({ offset: 0, limit: 20 })
    query.set({ offset: 20 })
    expect(selection()).toBeUndefined()
  })

  it("follows the query signal for selectReactive when the state exposes no reactive source", () => {
    let current: Record<string, KeyedEntry<Query, Page, string>> = {}
    const h = setup({
      state: keyedState(
        () => current,
        next => (current = next)
      )
    })
    const query = signal<Query>({ offset: 0 })
    const selection = h.reads.selectReactive(query)
    expect(selection()).toBeUndefined()
    h.reads.read({ offset: 0 }).subscribe()
    expect(current[cacheKey({ offset: 0 })]?.result).toEqual(page(0, 20))
    // Without a source, entry writes alone never invalidate the cached projection.
    expect(selection()).toBeUndefined()
    query.set({ offset: 20 })
    expect(selection()).toBeUndefined()
    // A query change re-reads the same state, so the projection resolves the stored entry.
    query.set({ offset: 0 })
    expect(selection()?.query).toEqual({ offset: 0, limit: 20 })
  })

  it("fails a sessionless read with the dedicated error instead of the admission one", () => {
    const overflow = vi.fn(() => "overflow")
    const noSessionError = vi.fn(() => "denied")
    const h = setup({ noSession: "failure", noSessionError, overflow })
    h.deny()
    const emitted: unknown[] = []
    h.reads.read({}).subscribe(value => emitted.push(value))
    expect(noSessionError).toHaveBeenCalledTimes(1)
    expect(overflow).not.toHaveBeenCalled()
    expect(emitted).toEqual([expect.objectContaining({ success: false, error: "denied" })])
  })

  it("completes observation empty without a session while the same store still fails a read", () => {
    const h = setup({
      noSession: "failure",
      noSessionError: () => "denied",
      noSessionObserve: "empty"
    })
    h.deny()
    let emitted = 0
    let completed = false
    h.reads.observe({}).subscribe({
      next: () => emitted++,
      complete: () => (completed = true)
    })
    expect([emitted, completed]).toEqual([0, true])
    const read: unknown[] = []
    h.reads.read({}).subscribe(value => read.push(value))
    expect(read).toEqual([expect.objectContaining({ success: false, error: "denied" })])
  })

  it("rescinds freshness on a failed read when expireOnError is set", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    try {
      const h = setup({ ttl: 100, expireOnError: true })
      h.reads.read({}).subscribe()
      expect(h.reads.select({})?.expires).toBe(1100)
      h.source.mockReturnValue(of(Result.failure("down")))
      h.reads.read({}, true).subscribe()
      expect(h.reads.select({})).toMatchObject({ result: page(), error: "down", expires: 0 })
    } finally {
      now.mockRestore()
    }
  })
})
