import { EMPTY, Observable, Subject, of, throwError } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { createReadResource, ReadResourceState } from "./read-resource"

function setup() {
  let state: ReadResourceState<number[], string> = {
    data: [],
    loaded: false,
    pendingReads: 0,
    refreshing: false,
    expires: 0,
    error: undefined
  }
  let generation = 0
  let allowed = true
  const cancelled = new Subject<void>()
  const source = vi.fn<() => Observable<Result<number[], string>>>(
    () => new Subject<Result<number[], string>>()
  )
  const resource = createReadResource({
    state: {
      get: () => state,
      update: (
        update: (
          state: ReadResourceState<number[], string>
        ) => Partial<ReadResourceState<number[], string>>
      ) => {
        state = { ...state, ...update(state) }
      }
    },
    initialData: () => [],
    request: () => source(),
    normalizeError: () => "unexpected",
    ttl: 100,
    scope: { check: () => allowed, generation: () => generation, cancelled$: cancelled }
  })
  return {
    resource,
    source,
    state: () => state,
    deny: () => {
      allowed = false
    },
    changeSession: () => {
      generation++
      cancelled.next()
      resource.reset()
    }
  }
}

describe("single read resource", () => {
  it("defers, shares and ref-counts reads, settling the last cancellation", () => {
    const h = setup()
    const response = new Subject<Result<number[], string>>()
    h.source.mockReturnValue(response)
    const read = h.resource.read()
    expect(h.source).not.toHaveBeenCalled()
    const a = read.subscribe(),
      b = h.resource.read().subscribe()
    expect(h.source).toHaveBeenCalledTimes(1)
    expect(h.state().pendingReads).toBe(1)
    a.unsubscribe()
    expect(response.observed).toBe(true)
    b.unsubscribe()
    expect(response.observed).toBe(false)
    expect(h.state().pendingReads).toBe(0)
    h.resource.read().subscribe().unsubscribe()
    expect(h.source).toHaveBeenCalledTimes(2)
  })

  it("renews TTL only on success and preserves stale data through failed refresh", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    try {
      const h = setup()
      h.source.mockImplementation(() => of(Result.success([1])))
      h.resource.read().subscribe()
      expect(h.state().expires).toBe(1100)
      now.mockReturnValue(1099)
      h.resource.read().subscribe()
      expect(h.source).toHaveBeenCalledTimes(1)
      now.mockReturnValue(1100)
      const response = new Subject<Result<number[], string>>()
      h.source.mockReturnValue(response)
      h.resource.read().subscribe()
      expect(h.state().refreshing).toBe(true)
      response.next(Result.failure("offline"))
      response.complete()
      expect(h.state()).toMatchObject({
        data: [1],
        loaded: true,
        expires: 1100,
        error: "offline",
        refreshing: false,
        pendingReads: 0
      })
      h.source.mockImplementation(() => throwError(() => new Error("transport")))
      h.resource.read().subscribe()
      expect(h.state().error).toBe("unexpected")
      expect(h.state().expires).toBe(1100)
    } finally {
      now.mockRestore()
    }
  })

  it("overlaps force reads while delivering stale results without committing stale errors", () => {
    const h = setup(),
      older = new Subject<Result<number[], string>>(),
      newer = new Subject<Result<number[], string>>()
    h.source.mockReturnValueOnce(older).mockReturnValueOnce(newer)
    const received = vi.fn()
    h.resource.read().subscribe(received)
    h.resource.read(true).subscribe()
    expect(older.observed).toBe(true)
    expect(h.state().pendingReads).toBe(2)
    newer.next(Result.success([2]))
    newer.complete()
    expect(h.state().pendingReads).toBe(1)
    older.next(Result.failure("obsolete"))
    older.complete()
    expect(received).toHaveBeenCalledWith(Result.failure("obsolete"))
    expect(h.state()).toMatchObject({ data: [2], error: undefined, pendingReads: 0 })
  })

  it("invalidates without cancelling old subscribers and permits an independent read", () => {
    const h = setup(),
      old = new Subject<Result<number[], string>>()
    h.source.mockReturnValueOnce(old).mockImplementation(() => of(Result.success([2])))
    const received = vi.fn()
    h.resource.read().subscribe(received)
    h.resource.invalidate()
    h.resource.read().subscribe()
    old.next(Result.success([1]))
    old.complete()
    expect(received).toHaveBeenCalledWith(Result.success([1]))
    expect(h.state().data).toEqual([2])
  })

  it("reset cancels all flights, fences reentrant old finalizers and restores read state", () => {
    const h = setup(),
      old = new Subject<Result<number[], string>>(),
      fresh = new Subject<Result<number[], string>>()
    h.source.mockReturnValueOnce(old).mockReturnValueOnce(fresh)
    h.resource.read().subscribe({ complete: () => h.resource.read().subscribe() })
    h.resource.reset()
    expect(old.observed).toBe(false)
    expect(fresh.observed).toBe(true)
    expect(h.state()).toMatchObject({ data: [], loaded: false, expires: 0, pendingReads: 1 })
    fresh.next(Result.success([3]))
    fresh.complete()
    expect(h.state()).toMatchObject({ data: [3], pendingReads: 0 })
  })

  it("does not let an obsolete finalizer stop the current refresh", () => {
    const h = setup()
    h.source.mockImplementationOnce(() => of(Result.success([1])))
    h.resource.read().subscribe()
    const older = new Subject<Result<number[], string>>()
    const newer = new Subject<Result<number[], string>>()
    h.source.mockReturnValueOnce(older).mockReturnValueOnce(newer)
    h.resource.read(true).subscribe()
    h.resource.read(true).subscribe()
    older.next(Result.success([9]))
    older.complete()
    expect(h.state()).toMatchObject({ data: [1], refreshing: true, pendingReads: 1 })
    newer.next(Result.success([2]))
    newer.complete()
    expect(h.state()).toMatchObject({ data: [2], refreshing: false, pendingReads: 0 })
  })

  it("settles empty completion and synchronous throws without marking data verified", () => {
    const h = setup()
    h.source.mockReturnValueOnce(EMPTY).mockImplementationOnce(() => {
      throw new Error("sync")
    })
    h.resource.read().subscribe()
    expect(h.state()).toMatchObject({ loaded: false, pendingReads: 0, expires: 0 })
    h.resource.read().subscribe()
    expect(h.state()).toMatchObject({
      loaded: false,
      pendingReads: 0,
      expires: 0,
      error: "unexpected"
    })
  })

  it("guards dispatch and clears session-old reads", () => {
    const h = setup(),
      response = new Subject<Result<number[], string>>()
    h.source.mockReturnValue(response)
    h.resource.read().subscribe()
    h.changeSession()
    response.next(Result.success([1]))
    expect(response.observed).toBe(false)
    expect(h.state()).toMatchObject({ data: [], loaded: false, pendingReads: 0 })
    h.deny()
    h.resource.read().subscribe()
    expect(h.source).toHaveBeenCalledTimes(1)
  })
})
