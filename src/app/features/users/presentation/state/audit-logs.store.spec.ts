import { signal } from "@angular/core"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { TestBed } from "@angular/core/testing"
import { Subject } from "rxjs"
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
