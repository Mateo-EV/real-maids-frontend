import { PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { of, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { Result } from "@/app/shared/utils/result"
import { GetAuditLogsUseCase } from "../../application/use-cases/get-audit-logs.use-case"
import { AuditLog } from "../../domain/entities/audit-log.entity"
import { AuditPage } from "../../domain/models/audit-page"
import { AuditLogError } from "../../domain/errors/audit-log.error"
import { AuditLogsStore } from "./audit-logs.store"

type Response = Result<AuditPage, AuditLogError>
const page = (globalTotal = 90): AuditPage => ({
  items: [],
  total: 0,
  offset: 0,
  limit: 5,
  page: 0,
  size: 5,
  totalPages: 0,
  globalTotal
})
function setup(platform = "browser") {
  const session = signal<AuthSession | null>(
    AuthSession.create("Test", "test@example.test", null, null, 1)
  )
  const changes = new Subject<AuthSession | null>()
  const execute = vi.fn(() => of<Response>(Result.success(page())))
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: platform },
      { provide: AuthStore, useValue: { session } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
      { provide: GetAuditLogsUseCase, useValue: { execute } }
    ]
  })
  return { store: TestBed.inject(AuditLogsStore), execute, session, changes }
}
afterEach(() => vi.useRealTimers())
describe("Audit consumer-triggered TTL", () => {
  it("reuses a successful query until the exact 30000ms boundary without polling or hit renewal", () => {
    vi.useFakeTimers()
    const { store, execute } = setup()
    store.load({ size: 5 }).subscribe()
    vi.advanceTimersByTime(29999)
    store.load({ size: 5 }).subscribe()
    expect(execute).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(execute).toHaveBeenCalledTimes(1)
    store.load({ size: 5 }).subscribe()
    expect(execute).toHaveBeenCalledTimes(2)
  })
  it("shares and ref-counts reads, settling flags only when the final subscriber leaves", () => {
    const { store, execute } = setup()
    const pending = new Subject<Response>()
    execute.mockReturnValue(pending)
    const first = store.load({ size: 5 }).subscribe()
    const second = store.load({ size: 5 }).subscribe()
    expect(execute).toHaveBeenCalledTimes(1)
    first.unsubscribe()
    expect(pending.observed).toBe(true)
    expect(store.loading()).toBe(true)
    second.unsubscribe()
    expect(pending.observed).toBe(false)
    expect(store.loading()).toBe(false)
    store.load({ size: 5 }).subscribe().unsubscribe()
    expect(execute).toHaveBeenCalledTimes(2)
  })
  it("keeps stale verified zero and errors without renewing expiry; force bypasses freshness", () => {
    vi.useFakeTimers()
    const { store, execute } = setup()
    store.load({ size: 5 }).subscribe()
    vi.advanceTimersByTime(30000)
    const pending = new Subject<Response>()
    execute.mockReturnValueOnce(pending)
    store.load({ size: 5 }).subscribe()
    expect(store.refreshing()).toBe(true)
    expect(store.loading()).toBe(false)
    expect(store.total()).toBe(0)
    pending.next(Result.failure(new AuditLogError("FORBIDDEN")))
    pending.complete()
    expect(store.error()?.code).toBe("FORBIDDEN")
    expect(store.refreshing()).toBe(false)
    store.load({ size: 5 }).subscribe()
    expect(execute).toHaveBeenCalledTimes(3)
    store.load({ size: 5 }, true).subscribe()
    expect(execute).toHaveBeenCalledTimes(4)
  })
  it("keys every filter and pagination variant, bounds history and retains the visible page", () => {
    const { store, execute } = setup()
    const queries = [
      {},
      { userId: 1 },
      { fromUTC: "2026-01-01" },
      { toUTC: "2026-01-02" },
      { entity: "usuario" },
      { action: "CREAR" },
      { page: 1 },
      { size: 5 }
    ]
    queries.forEach(query => store.load(query).subscribe())
    queries.forEach(query => store.load(query).subscribe())
    expect(execute).toHaveBeenCalledTimes(queries.length)
    for (let userId = 2; userId < 30; userId++) store.load({ userId }).subscribe()
    expect(Object.keys(store.entries())).toHaveLength(20)
    store.load({ userId: 29 }).subscribe()
    expect(store.total()).toBe(0)
    store.load({}).subscribe()
    expect(execute).toHaveBeenCalledTimes(37)
  })
  it("never restores an old cached global total or extends its freshness on a page hit", () => {
    vi.useFakeTimers()
    const { store, execute } = setup()
    store.load({ size: 5 }).subscribe()
    vi.advanceTimersByTime(10000)
    execute.mockReturnValueOnce(of(Result.success(page(100))))
    store.loadGlobalTotal(true).subscribe()
    expect(store.globalTotal()).toBe(100)
    store.load({ size: 5 }).subscribe()
    expect(store.globalTotal()).toBe(100)
    vi.advanceTimersByTime(29999)
    store.loadGlobalTotal().subscribe()
    expect(execute).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(1)
    store.loadGlobalTotal().subscribe()
    expect(execute).toHaveBeenCalledTimes(3)
    store.loadGlobalTotal(true).subscribe()
    expect(execute).toHaveBeenCalledTimes(4)
  })
  it("shares global reads, preserves verified zero on failure and retries without renewing TTL", () => {
    vi.useFakeTimers()
    const { store, execute } = setup()
    execute.mockReturnValueOnce(of(Result.success(page(0))))
    store.loadGlobalTotal().subscribe()
    vi.advanceTimersByTime(30000)
    const pending = new Subject<Response>()
    execute.mockReturnValueOnce(pending)
    const first = store.loadGlobalTotal().subscribe()
    const second = store.loadGlobalTotal().subscribe()
    expect(execute).toHaveBeenCalledTimes(2)
    expect(store.globalRefreshing()).toBe(true)
    first.unsubscribe()
    expect(pending.observed).toBe(true)
    pending.next(Result.failure(new AuditLogError("FORBIDDEN")))
    pending.complete()
    expect(store.globalTotal()).toBe(0)
    expect(store.globalError()?.code).toBe("FORBIDDEN")
    expect(store.globalRefreshing()).toBe(false)
    second.unsubscribe()
    store.loadGlobalTotal().subscribe()
    expect(execute).toHaveBeenCalledTimes(3)
  })
  it("clears sensitive reads and fences old completions on session loss but not renewal", () => {
    const { store, execute, session, changes } = setup()
    store.load({ size: 5 }).subscribe()
    changes.next(session())
    store.load({ size: 5 }).subscribe()
    expect(execute).toHaveBeenCalledTimes(1)
    const pending = new Subject<Response>()
    execute.mockReturnValueOnce(pending)
    store.load({ userId: 2 }).subscribe()
    session.set(null)
    changes.next(null)
    expect(pending.observed).toBe(false)
    pending.next(Result.success(page(999)))
    expect(store.globalTotal()).toBeNull()
    expect(store.total()).toBe(0)
    expect(Object.keys(store.entries())).toHaveLength(0)
    store.load({ size: 5 }).subscribe()
    store.loadGlobalTotal().subscribe()
    expect(execute).toHaveBeenCalledTimes(2)
  })
  it("preserves matching stale rows, hides unrelated rows and renews only after a successful read", () => {
    vi.useFakeTimers()
    const { store, execute } = setup()
    const log = AuditLog.create(1, 2, "usuario", "CREAR", null, null, new Date(), "Actor", "2", [])
    execute.mockReturnValueOnce(
      of(Result.success({ ...page(), items: [log], total: 1, totalPages: 1 }))
    )
    store.load({ size: 5 }).subscribe()
    vi.advanceTimersByTime(30000)
    const pending = new Subject<Response>()
    execute.mockReturnValueOnce(pending)
    store.load({ size: 5 }).subscribe()
    expect(store.items()).toEqual([log])
    expect(store.refreshing()).toBe(true)
    vi.advanceTimersByTime(10000)
    pending.next(Result.failure(new AuditLogError("FORBIDDEN")))
    pending.complete()
    expect(store.items()).toEqual([log])
    const unrelated = new Subject<Response>()
    execute.mockReturnValueOnce(unrelated)
    store.load({ userId: 7, size: 5 }).subscribe().unsubscribe()
    expect(store.items()).toEqual([])
    expect(store.total()).toBe(0)
    store.load({ size: 5 }).subscribe()
    expect(execute).toHaveBeenCalledTimes(4)
    vi.advanceTimersByTime(29999)
    store.load({ size: 5 }).subscribe()
    expect(execute).toHaveBeenCalledTimes(4)
    vi.advanceTimersByTime(1)
    store.load({ size: 5 }).subscribe()
    expect(execute).toHaveBeenCalledTimes(5)
  })
  it("normalizes supported pagination and inclusive day aliases without key collisions", () => {
    const { store, execute } = setup()
    store.load({ page: 1, size: 5, dayUTC: "2026-01-01" }).subscribe()
    store.load({ offset: 5, limit: 5, fromUTC: "2026-01-01", toUTC: "2026-01-01" }).subscribe()
    expect(execute).toHaveBeenCalledTimes(1)
    // Contradictory aliases must reach adapter validation, never reuse a valid page.
    store.load({ page: 1, size: 5, offset: 10, dayUTC: "2026-01-01" }).subscribe()
    expect(execute).toHaveBeenCalledTimes(2)
  })
  it("caps concurrent variants without evicting an in-flight visible page", () => {
    const { store, execute } = setup()
    const pending = new Subject<Response>()
    execute.mockReturnValue(pending)
    const subscriptions = Array.from({ length: 20 }, (_, userId) =>
      store.load({ userId }).subscribe()
    )
    const visible = store.currentKey()
    store.load({ userId: 21 }).subscribe()
    expect(execute).toHaveBeenCalledTimes(20)
    expect(store.currentKey()).toBe(visible)
    expect(Object.keys(store.entries())).toHaveLength(20)
    subscriptions.forEach(subscription => subscription.unsubscribe())
    expect(pending.observed).toBe(false)
    expect(store.loading()).toBe(false)
  })
  it("fences list and metric on identity replacement and fixed-session expiry", () => {
    vi.useFakeTimers()
    const { store, execute, session, changes } = setup()
    const deadline = Date.now() + 1000
    session.set(AuthSession.create("Test", "test@example.test", null, deadline, 1))
    store.load({}).subscribe()
    session.set(AuthSession.create("Renamed", "test@example.test", "New label", deadline, 1))
    changes.next(session())
    store.load({}).subscribe()
    expect(execute).toHaveBeenCalledTimes(1)
    const pending = new Subject<Response>()
    execute.mockReturnValue(pending)
    store.loadGlobalTotal(true).subscribe()
    store.load({ userId: 2 }).subscribe()
    session.set(AuthSession.create("Other", "other@example.test", null, deadline, 2))
    changes.next(session())
    expect(pending.observed).toBe(false)
    expect(store.globalTotal()).toBeNull()
    expect(store.items()).toEqual([])
    store.loadGlobalTotal().subscribe()
    vi.advanceTimersByTime(1000)
    store.load({}).subscribe()
    expect(pending.observed).toBe(false)
    expect(store.globalTotal()).toBeNull()
    expect(store.globalLoading()).toBe(false)
    expect(Object.keys(store.entries())).toHaveLength(0)
  })
  it("does not dispatch SSR reads", () => {
    const { store, execute } = setup("server")
    store.load({}).subscribe()
    store.loadGlobalTotal().subscribe()
    expect(execute).not.toHaveBeenCalled()
  })
})
