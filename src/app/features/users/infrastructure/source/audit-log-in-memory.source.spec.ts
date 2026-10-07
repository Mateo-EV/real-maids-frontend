import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { AuditLog } from "../../domain/entities/audit-log.entity"
import { AuditLogError } from "../../domain/errors/audit-log.error"
import { AuditLogInMemorySource } from "./audit-log-in-memory.source"

async function settle<T>(stream: Observable<T>) {
  const pending = firstValueFrom(stream)
  await vi.runAllTimersAsync()
  return pending
}

describe("Read-only audit source", () => {
  let source: AuditLogInMemorySource
  beforeEach(() => {
    vi.useFakeTimers()
    source = TestBed.inject(AuditLogInMemorySource)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("returns defaults, stable fictitious fixtures and total before slicing", async () => {
    const result = await settle(source.getAuditLogs())
    expect(result).toMatchObject({ success: true, data: { total: 48, offset: 0, limit: 20 } })
    if (!result.success) throw result.error
    expect(result.data.items).toHaveLength(20)
    expect(result.data.items[0]).toBeInstanceOf(AuditLog)
    expect(result.data.items.every(item => item.details.includes("FICTITIOUS DEMO DATA"))).toBe(
      true
    )
    const secondSource = new AuditLogInMemorySource()
    expect(await settle(secondSource.getAuditLogs())).toEqual(result)
  })

  it("orders date descending with ID descending ties, and slices partial/empty pages", async () => {
    const all = await settle(source.getAuditLogs({ limit: 100 }))
    if (!all.success) throw all.error
    const items = all.data.items
    expect(items).toHaveLength(48)
    expect(new Set(items.map(item => item.id)).size).toBe(48)
    let ties = 0
    for (let index = 1; index < items.length; index++) {
      const previous = items[index - 1]
      const current = items[index]
      expect(previous.date.getTime()).toBeGreaterThanOrEqual(current.date.getTime())
      if (previous.date.getTime() === current.date.getTime()) {
        ties++
        expect(previous.id).toBeGreaterThan(current.id)
      }
    }
    expect(ties).toBeGreaterThan(0)
    expect(await settle(source.getAuditLogs({ offset: 20, limit: 20 }))).toMatchObject({
      success: true,
      data: { items: items.slice(20, 40), total: 48, offset: 20, limit: 20 }
    })
    expect(await settle(source.getAuditLogs({ offset: 40 }))).toMatchObject({
      success: true,
      data: { items: items.slice(40), total: 48, offset: 40, limit: 20 }
    })
    for (const offset of [48, 99, Number.MAX_SAFE_INTEGER]) {
      expect(await settle(source.getAuditLogs({ offset }))).toMatchObject({
        success: true,
        data: { items: [], total: 48, offset, limit: 20 }
      })
    }
  })

  it("captures primitive inputs at invocation and clones every subscription", async () => {
    const params = { offset: 0, limit: 1 }
    const query = source.getAuditLogs(params)
    params.offset = 48
    params.limit = 100
    const first = await settle(query)
    if (!first.success) throw first.error
    expect(first.data.items).toHaveLength(1)
    const original = { ...first.data.items[0], date: new Date(first.data.items[0].date) }
    first.data.items[0].date.setTime(0)
    first.data.items[0].details = "Changed"
    first.data.items[0].id = -1
    first.data.items.push(first.data.items[0])
    const second = await settle(query)
    if (!second.success) throw second.error
    expect(second.data.items).toHaveLength(1)
    expect(second.data.items[0]).toEqual(original)
    expect(second.data.items[0]).not.toBe(first.data.items[0])
    expect(second.data.items[0].date).not.toBe(first.data.items[0].date)
  })

  for (const field of ["offset", "limit"] as const) {
    for (const value of [
      null,
      "1",
      NaN,
      Infinity,
      -Infinity,
      1.5,
      -1,
      Number.MAX_SAFE_INTEGER + 1,
      ...(field === "limit" ? [0, 101] : [])
    ]) {
      it(`returns audit failure for ${field}=${String(value)} without throwing`, async () => {
        const result = await settle(
          source.getAuditLogs({ [field]: value } as unknown as PaginationParams)
        )
        expect(result).toMatchObject({ success: false, error: { code: "INVALID_PAGINATION" } })
        if (result.success) throw new Error("Expected failure")
        expect(result.error).toBeInstanceOf(AuditLogError)
      })
    }
  }

  it.each([1, 0])("delays limit=%s results until 250ms and cancels emissions", async limit => {
    const next = vi.fn()
    const error = vi.fn()
    const complete = vi.fn()
    const query = source.getAuditLogs({ limit })
    const subscription = query.subscribe({ next, error, complete })
    await vi.advanceTimersByTimeAsync(249)
    expect(next).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
    subscription.unsubscribe()
    await vi.runAllTimersAsync()
    expect(next).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()

    query.subscribe({ next, error, complete })
    await vi.advanceTimersByTimeAsync(249)
    expect(next).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(complete).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(next).toHaveBeenCalledOnce()
    expect(error).not.toHaveBeenCalled()
    expect(complete).toHaveBeenCalledOnce()
    const result = next.mock.calls[0][0]
    if (limit === 1) {
      expect(result).toMatchObject({
        success: true,
        data: { total: 48, offset: 0, limit: 1 }
      })
      expect(result.data.items).toHaveLength(1)
      expect(result.data.items[0]).toBeInstanceOf(AuditLog)
    } else {
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_PAGINATION" } })
      expect(result.error).toBeInstanceOf(AuditLogError)
    }
  })
})
