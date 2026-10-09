import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { UserSessionInMemorySource } from "./user-session-in-memory.source"

describe("UserSessionInMemorySource", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-09-01T12:00:00Z"))
  })
  afterEach(() => vi.useRealTimers())
  async function finish<T>(request: Promise<T>) {
    await vi.advanceTimersByTimeAsync(250)
    return request
  }
  it("queries multiple, zero and only nonexpired sessions with defensive dates", async () => {
    const source = TestBed.inject(UserSessionInMemorySource)
    const result = await finish(firstValueFrom(source.getUserSessions()))
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.filter(session => session.userId === 1)).toHaveLength(2)
    expect(result.data.filter(session => session.userId === 5)).toHaveLength(0)
    expect(result.data.every(session => session.expiryDate.getTime() > Date.now())).toBe(true)
    const first = result.data[0]
    const expiry = first.expiryDate.getTime()
    first.expiryDate.setTime(0)
    first.startDate.setTime(0)
    first.device = "changed"
    const next = await finish(firstValueFrom(source.getUserSessions()))
    if (!next.success) throw next.error
    expect(next.data[0].expiryDate.getTime()).toBe(expiry)
    expect(next.data[0].startDate.getTime()).not.toBe(0)
    expect(next.data[0].device).not.toBe("changed")
    vi.setSystemTime(new Date(expiry))
    const expired = await finish(firstValueFrom(source.getUserSessions()))
    if (!expired.success) throw expired.error
    expect(expired.data.some(session => session.id === first.id)).toBe(false)
  })
  it("protects current, rejects unknown/mismatched IDs and revokes an individual session", async () => {
    const source = TestBed.inject(UserSessionInMemorySource)
    for (const [userId, id, code] of [
      [1, 1, "CURRENT_SESSION"],
      [1, 999, "SESSION_NOT_FOUND"],
      [2, 2, "SESSION_NOT_FOUND"]
    ] as const) {
      const result = await finish(firstValueFrom(source.revokeUserSession(userId, id)))
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.code).toBe(code)
    }
    expect((await finish(firstValueFrom(source.revokeUserSession(1, 2)))).success).toBe(true)
    const remaining = await finish(firstValueFrom(source.getUserSessions()))
    if (!remaining.success) throw remaining.error
    expect(remaining.data.some(session => session.id === 2)).toBe(false)
    const duplicate = await finish(firstValueFrom(source.revokeUserSession(1, 2)))
    expect(duplicate.success).toBe(false)
  })
  it("has no effects after cancellation and rejects expired revocation", async () => {
    const source = TestBed.inject(UserSessionInMemorySource)
    const next = vi.fn()
    source.revokeUserSession(1, 2).subscribe(next).unsubscribe()
    await vi.advanceTimersByTimeAsync(250)
    expect(next).not.toHaveBeenCalled()
    const result = await finish(firstValueFrom(source.getUserSessions()))
    if (!result.success) throw result.error
    expect(result.data.some(session => session.id === 2)).toBe(true)
    vi.setSystemTime(new Date("2100-01-01T00:00:00Z"))
    const expired = await finish(firstValueFrom(source.revokeUserSession(1, 2)))
    expect(expired.success).toBe(false)
    if (!expired.success) expect(expired.error.code).toBe("SESSION_NOT_FOUND")
  })
})
