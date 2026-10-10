import { TestBed } from "@angular/core/testing"
import { Subject } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { GetAuditLogsUseCase } from "../../application/use-cases/get-audit-logs.use-case"
import { Result } from "@/app/shared/utils/result"
import { AuditLog } from "../../domain/entities/audit-log.entity"
import { AuditLogError } from "../../domain/errors/audit-log.error"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { AuditLogsStore } from "./audit-logs.store"

type Response = Result<PaginationResponse<AuditLog>, AuditLogError>
describe("Audit shared state", () => {
  it("ignores stale successes/failures/finalizers and leaves global count independent", () => {
    const older = new Subject<Response>(),
      newer = new Subject<Response>()
    const execute = vi.fn().mockReturnValueOnce(older).mockReturnValueOnce(newer)
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    store.load({ limit: 5 }).subscribe()
    store.load({ entity: "usuario", limit: 5 }).subscribe()
    newer.next(Result.success({ items: [], total: 6, offset: 0, limit: 5 }))
    older.next(Result.success({ items: [], total: 48, offset: 0, limit: 5 }))
    older.next(Result.failure(new AuditLogError("INVALID_FILTER")))
    older.complete()
    expect(store.total()).toBe(6)
    expect(store.error()).toBeUndefined()
    expect(store.loading()).toBe(true)
    newer.complete()
    expect(store.loading()).toBe(false)
    expect(store.globalTotal()).toBeNull()
  })
  it("global source totals remain unchanged by filtered pages", () => {
    const total = new Subject<Response>(),
      filtered = new Subject<Response>()
    const execute = vi.fn().mockReturnValueOnce(total).mockReturnValueOnce(filtered)
    TestBed.configureTestingModule({
      providers: [{ provide: GetAuditLogsUseCase, useValue: { execute } }]
    })
    const store = TestBed.inject(AuditLogsStore)
    store.loadGlobalTotal().subscribe()
    total.next(Result.success({ items: [], total: 48, offset: 0, limit: 1 }))
    total.complete()
    store.load({ entity: "sesion", limit: 5 }).subscribe()
    filtered.next(Result.success({ items: [], total: 9, offset: 0, limit: 5 }))
    filtered.complete()
    expect(store.globalTotal()).toBe(48)
    expect(store.total()).toBe(9)
  })

  it("cancellation ends loading and thrown errors become typed retryable failures", () => {
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
    expect(store.loading()).toBe(false)
  })
})
