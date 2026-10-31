import { PLATFORM_ID, signal } from "@angular/core"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { TestBed } from "@angular/core/testing"
import { Observable, of, Subject } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GetAuditLogsUseCase } from "../../application/use-cases/get-audit-logs.use-case"
import { Result } from "@/app/shared/utils/result"
import { AuditPage } from "../../domain/models/audit-page"
import { AuditLogError } from "../../domain/errors/audit-log.error"
import { AuditLogsStore } from "./audit-logs.store"

type Response = Result<AuditPage, AuditLogError>
const page = (total: number, globalTotal = 90): AuditPage => ({
  items: [],
  total,
  offset: 0,
  limit: 5,
  page: 0,
  size: 5,
  totalPages: Math.ceil(total / 5),
  globalTotal
})
describe("Audit shared state", () => {
  it("does not reinsert query/global resources from completion callbacks during session reset", () => {
    const session = signal<AuthSession | null>(AuthSession.create("Test", "test@example.test"))
    const changes = new Subject<AuthSession | null>(),
      pending = new Subject<Response>()
    const execute = vi.fn(() => pending)
    TestBed.overrideProvider(AuthStore, { useValue: { session } })
    TestBed.overrideProvider(ObserveAuthSessionUseCase, { useValue: { execute: () => changes } })
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    store.load({}).subscribe({ complete: () => store.load({}).subscribe() })
    store.loadGlobalTotal().subscribe({ complete: () => store.loadGlobalTotal().subscribe() })
    const replacement = AuthSession.create("Other", "other@example.test")
    session.set(replacement)
    changes.next(replacement)
    expect(execute).toHaveBeenCalledTimes(2)
    expect(store.entries()).toEqual({})
    expect(store.globalResult()).toBeUndefined()
    expect(store.currentKey()).toBe("")
    expect(store.sessionRevision()).toBe(1)
    store.load({}).subscribe().unsubscribe()
    expect(execute).toHaveBeenCalledTimes(3)
    session.set(null)
    changes.next(null)
    expect(store.sessionRevision()).toBe(2)
  })
  it("keeps global freshness independent of cached page access and retains zero after failed revalidation", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    try {
      const execute = vi.fn<() => Observable<Response>>(() => of(Result.success(page(0, 0))))
      TestBed.configureTestingModule({
        providers: [{ provide: GetAuditLogsUseCase, useValue: { execute } }]
      })
      const store = TestBed.inject(AuditLogsStore)
      store.load({}).subscribe()
      expect(store.globalExpires()).toBe(31000)
      now.mockReturnValue(2000)
      store.loadGlobalTotal(true).subscribe()
      expect(store.globalExpires()).toBe(32000)
      now.mockReturnValue(31000)
      store.load({}).subscribe()
      expect(execute).toHaveBeenCalledTimes(3)
      expect(store.globalExpires()).toBe(61000)
      now.mockReturnValue(40000)
      store.load({}).subscribe()
      store.loadGlobalTotal().subscribe()
      expect(execute).toHaveBeenCalledTimes(3)
      expect(store.globalExpires()).toBe(61000)
      const failed = new Subject<Response>()
      execute.mockReturnValue(failed)
      now.mockReturnValue(61000)
      store.loadGlobalTotal().subscribe()
      expect(store.globalRefreshing()).toBe(true)
      failed.next(Result.failure(new AuditLogError("UNEXPECTED")))
      failed.complete()
      expect(store.globalTotal()).toBe(0)
      expect(store.globalExpires()).toBe(61000)
      expect(store.globalError()?.code).toBe("UNEXPECTED")
      expect(store.globalRefreshing()).toBe(false)
    } finally {
      now.mockRestore()
    }
  })
  it("uses the latest caller's equivalent pagination input when forcing a retained key", () => {
    const execute = vi.fn(() => of(Result.success(page(1))))
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    store.load({ page: 0, size: 5 }).subscribe()
    store.load({ offset: 0, limit: 5 }, true).subscribe()
    expect(execute).toHaveBeenLastCalledWith({ offset: 0, limit: 5 })
    expect(Object.keys(store.entries())).toHaveLength(1)
  })
  it("bounds history while pinning in-flight keys and the current projection", () => {
    const pending = new Subject<Response>()
    const execute = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockImplementation(() => of(Result.success(page(1))))
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    const active = store.load({ entity: "active" }).subscribe()
    const activeKey = store.currentKey()
    for (let id = 0; id < 25; id++) store.load({ entity: String(id) }).subscribe()
    expect(Object.keys(store.entries())).toHaveLength(20)
    expect(store.entries()[activeKey]).toBeDefined()
    expect(store.entries()[store.currentKey()]).toBeDefined()
    active.unsubscribe()
  })
  it("does not dispatch query/global reads on the server", () => {
    const execute = vi.fn()
    TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    store.load({}).subscribe()
    store.loadGlobalTotal().subscribe()
    expect(execute).not.toHaveBeenCalled()
    expect(store.entries()).toEqual({})
  })
  it("does not let a cached page overwrite newer global identity or effective pagination", () => {
    const execute = vi
      .fn()
      .mockReturnValueOnce(new Subject<Response>())
      .mockReturnValueOnce(new Subject<Response>())
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    store.load({ size: 10 }).subscribe()
    const pages = execute.mock.results[0].value as Subject<Response>
    pages.next(Result.success({ ...page(12, 80), page: 1, offset: 5, size: 5, limit: 5 }))
    pages.complete()
    store.loadGlobalTotal(true).subscribe()
    const global = execute.mock.results[1].value as Subject<Response>
    global.next(Result.success(page(12, 100)))
    global.complete()
    const identity = store.globalResult()
    store.load({ size: 10 }).subscribe()
    expect(execute).toHaveBeenCalledTimes(2)
    expect(store.globalTotal()).toBe(100)
    expect(store.globalResult()).toBe(identity)
    expect(store.page()).toBe(1)
    expect(store.size()).toBe(5)
  })
  it("keeps independent global ordering when a newer global read finishes before the page", () => {
    const list = new Subject<Response>(),
      global = new Subject<Response>()
    TestBed.configureTestingModule({
      providers: [
        {
          provide: GetAuditLogsUseCase,
          useValue: { execute: vi.fn().mockReturnValueOnce(list).mockReturnValueOnce(global) }
        }
      ]
    })
    const store = TestBed.inject(AuditLogsStore)
    store.load({ entity: "usuario" }).subscribe()
    store.loadGlobalTotal(true).subscribe()
    global.next(Result.success(page(1, 120)))
    global.complete()
    list.next(Result.success(page(4, 90)))
    list.complete()
    expect(store.total()).toBe(4)
    expect(store.globalTotal()).toBe(120)
  })
  it("joins forced in-flight reads and retains stale data/TTL on failure and cancellation", () => {
    const pending = new Subject<Response>()
    const execute = vi.fn().mockReturnValueOnce(pending)
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    store.load({}).subscribe()
    pending.next(Result.success(page(0, 0)))
    pending.complete()
    const key = store.currentKey(),
      expires = store.entries()[key].expires
    const refresh = new Subject<Response>()
    execute.mockReturnValue(refresh)
    const a = store.load({}, true).subscribe(),
      b = store.load({}, true).subscribe()
    expect(execute).toHaveBeenCalledTimes(2)
    expect(store.hasVerifiedResult()).toBe(true)
    expect(store.refreshing()).toBe(true)
    a.unsubscribe()
    expect(refresh.observed).toBe(true)
    refresh.next(Result.failure(new AuditLogError("UNEXPECTED")))
    refresh.complete()
    b.unsubscribe()
    expect(store.total()).toBe(0)
    expect(store.entries()[key].expires).toBe(expires)
    expect(store.error()?.code).toBe("UNEXPECTED")
    const last = store.load({}, true).subscribe()
    last.unsubscribe()
    expect(store.refreshing()).toBe(false)
  })
  it("preserves same-session renewal and clears query/global data on logout", () => {
    const session = signal<AuthSession | null>(
      AuthSession.create("Test", "test@example.test", null, null, 1)
    )
    const changes = new Subject<AuthSession | null>(),
      response = new Subject<Response>()
    TestBed.overrideProvider(AuthStore, { useValue: { session } })
    TestBed.overrideProvider(ObserveAuthSessionUseCase, { useValue: { execute: () => changes } })
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute: () => response } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    store.load({}).subscribe()
    response.next(Result.success(page(3)))
    const renewal = AuthSession.create("Renamed", "test@example.test", null, null, 1)
    session.set(renewal)
    changes.next(renewal)
    expect(store.sessionRevision()).toBe(0)
    expect(store.total()).toBe(3)
    session.set(null)
    changes.next(null)
    expect(store.sessionRevision()).toBe(1)
    expect(response.observed).toBe(false)
    expect(store.entries()).toEqual({})
    expect(store.globalTotal()).toBeNull()
    response.next(Result.success(page(9)))
    expect(store.entries()).toEqual({})
  })
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: AuthStore,
          useValue: {
            session: signal(AuthSession.create("Test", "test@example.test", null, null, 1))
          }
        },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => new Subject() } }
      ]
    })
  })
  it("ignores stale successes/failures/finalizers and consumes real server totals", () => {
    const older = new Subject<Response>(),
      newer = new Subject<Response>()
    const execute = vi.fn().mockReturnValueOnce(older).mockReturnValueOnce(newer)
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    store.load({ size: 5 }).subscribe()
    store.load({ entity: "usuario", size: 5 }).subscribe()
    newer.next(Result.success(page(6)))
    older.next(Result.success(page(48, 48)))
    older.next(Result.failure(new AuditLogError("INVALID_FILTER")))
    older.complete()
    expect(store.total()).toBe(6)
    expect(store.totalPages()).toBe(2)
    expect(store.globalTotal()).toBe(90)
    expect(store.error()).toBeUndefined()
    expect(store.loading()).toBe(true)
    newer.complete()
    expect(store.loading()).toBe(false)
  })
  it("loadGlobalTotal consumes totalGlobal, never filtered total or loaded rows", () => {
    const total = new Subject<Response>(),
      filtered = new Subject<Response>()
    const execute = vi.fn().mockReturnValueOnce(total).mockReturnValueOnce(filtered)
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    store.loadGlobalTotal().subscribe()
    expect(execute).toHaveBeenCalledExactlyOnceWith({ page: 0, size: 1 })
    store.load({ entity: "sesion", size: 5 }).subscribe()
    filtered.next(Result.success(page(9, 100)))
    filtered.complete()
    total.next(Result.success(page(48, 90)))
    total.complete()
    expect(store.globalTotal()).toBe(100)
    expect(store.total()).toBe(9)
  })
  it("cancellation ends loading, clears stale query totals and thrown errors become typed", () => {
    const pending = new Subject<Response>()
    const execute = vi
      .fn()
      .mockReturnValueOnce(pending)
      .mockImplementationOnce(() => {
        throw new Error("failed")
      })
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    const sub = store.load({}).subscribe()
    expect(store.loading()).toBe(true)
    sub.unsubscribe()
    expect(store.loading()).toBe(false)
    store.load({}).subscribe()
    expect(store.error()?.code).toBe("UNEXPECTED")
    expect(store.total()).toBe(0)
    expect(store.loading()).toBe(false)
  })
  it("a count failure does not modify the page or establish a fake count", () => {
    const failed = new Subject<Response>()
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute: () => failed } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    store.loadGlobalTotal().subscribe()
    failed.error(new Error("private backend detail"))
    expect(store.globalTotal()).toBeNull()
    expect(store.items()).toEqual([])
    expect(store.error()).toBeUndefined()
  })
})
