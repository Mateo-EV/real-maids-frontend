import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
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

  it("filters UTC day, entity and action before totals/pagination and exports every match", async () => {
    const all = await settle(source.getAllAuditLogs({ dayUTC: "2026-09-01", entity: "usuario" }))
    if (!all.success) throw all.error
    expect(all.data.length).toBeGreaterThan(5)
    expect(
      all.data.every(
        log => log.entity === "usuario" && log.date.toISOString().startsWith("2026-09-01")
      )
    ).toBe(true)
    const page = await settle(
      source.getAuditLogs({ dayUTC: "2026-09-01", entity: "usuario", limit: 5 })
    )
    expect(page).toMatchObject({
      success: true,
      data: { items: all.data.slice(0, 5), total: all.data.length }
    })
    const detail = await settle(source.getAuditLogById(all.data[0].id))
    expect(detail).toEqual(Result.success(all.data[0]))
  })

  it("rejects invalid filters and unknown IDs with typed errors", async () => {
    for (const filters of [
      { dayUTC: "2026-02-30" },
      { dayUTC: "2026-9-1" },
      { dayUTC: null },
      { entity: "bad" },
      { action: "bad" }
    ]) {
      expect(await settle(source.getAllAuditLogs(filters as never))).toMatchObject({
        success: false,
        error: { code: "INVALID_FILTER" }
      })
    }
    expect(await settle(source.getAuditLogById(999))).toMatchObject({
      success: false,
      error: { code: "AUDIT_LOG_NOT_FOUND" }
    })
  })

  it("uses UTC boundaries and combines all optional filters with stable ordering", async () => {
    const all = await settle(source.getAllAuditLogs())
    if (!all.success) throw all.error
    for (const dayUTC of ["2026-09-01", "2026-09-02", "2026-09-03"]) {
      const day = await settle(source.getAllAuditLogs({ dayUTC }))
      if (!day.success) throw day.error
      expect(day.data).toEqual(
        all.data.filter(log => log.date.toISOString().slice(0, 10) === dayUTC)
      )
    }
    const combined = await settle(
      source.getAuditLogs({
        dayUTC: "2026-09-01",
        entity: "usuario",
        action: "UPDATE",
        offset: 1,
        limit: 1
      })
    )
    const matches = all.data.filter(
      log =>
        log.date.toISOString().startsWith("2026-09-01") &&
        log.entity === "usuario" &&
        log.action === "UPDATE"
    )
    expect(combined).toMatchObject({
      success: true,
      data: { items: matches.slice(1, 2), total: matches.length }
    })
    expect(all.data.find(log => log.id === 30)?.date.toISOString()).toBe("2026-09-01T23:59:59.000Z")
    expect(all.data.find(log => log.id === 31)?.date.toISOString()).toBe("2026-09-02T00:00:00.000Z")
  })

  it("captures filters, clones nested changes across all/detail/page queries, and cancels new reads", async () => {
    const filters = { entity: "asignacion" as const }
    const request = source.getAllAuditLogs(filters)
    Object.assign(filters, { entity: "usuario" })
    const all = await settle(request)
    if (!all.success) throw all.error
    expect(all.data.every(log => log.entity === "asignacion")).toBe(true)
    const log = all.data[0]
    const original = log.changes![0].before
    Object.assign(log.changes![0], { before: "tampered" })
    log.date.setTime(0)
    const detail = await settle(source.getAuditLogById(log.id))
    if (!detail.success) throw detail.error
    expect(detail.data.changes![0].before).toBe(original)
    expect(detail.data.date.getTime()).not.toBe(0)
    const page = await settle(source.getAuditLogs({ entity: "asignacion" }))
    if (!page.success) throw page.error
    expect(page.data.items[0].changes![0].before).toBe(original)
    for (const stream of [
      source.getAllAuditLogs(),
      source.getAuditLogById(9),
      source.getAllAuditLogs({ dayUTC: "invalid" })
    ]) {
      const next = vi.fn()
      const sub = (stream as Observable<unknown>).subscribe(next)
      await vi.advanceTimersByTimeAsync(249)
      sub.unsubscribe()
      await vi.runAllTimersAsync()
      expect(next).not.toHaveBeenCalled()
    }
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
