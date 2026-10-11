import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { AuditLog } from "../../domain/entities/audit-log.entity"
import { AuditLogError } from "../../domain/errors/audit-log.error"
import {
  AUDIT_LOG_REPOSITORY,
  AuditLogRepository
} from "../../domain/repositories/audit-log.repository"
import { GetAuditLogsUseCase } from "./get-audit-logs.use-case"
import { GetAuditLogByIdUseCase } from "./get-audit-log-by-id.use-case"
import { ExportAuditLogsUseCase } from "./export-audit-logs.use-case"

describe("Audit stateless use cases", () => {
  for (const success of [true, false]) {
    it(`delegates query/detail/export without rewriting ${success ? "success" : "failure"}`, async () => {
      const log = AuditLog.create(
        1,
        2,
        "usuario",
        "ACTUALIZAR",
        "Sintético",
        "192.0.2.1",
        new Date(0),
        "Actor",
        "3"
      )
      const error = new AuditLogError("FORBIDDEN")
      const blob = new Blob(["CSV completo"], { type: "text/csv" })
      const query = of(
        success
          ? Result.success({
              items: [log],
              total: 6,
              offset: 0,
              limit: 5,
              page: 0,
              size: 5,
              totalPages: 2,
              globalTotal: 90
            })
          : Result.failure(error)
      )
      const detail = of(success ? Result.success(log) : Result.failure(error))
      const csv = of(success ? Result.success(blob) : Result.failure(error))
      const repository: AuditLogRepository = {
        getAuditLogs: vi.fn(() => query),
        getAuditLogById: vi.fn(() => detail),
        exportAuditLogs: vi.fn(() => csv)
      }
      TestBed.configureTestingModule({
        providers: [{ provide: AUDIT_LOG_REPOSITORY, useValue: repository }]
      })
      const filters = {
        userId: 2,
        fromUTC: "2026-09-01",
        toUTC: "2026-09-02",
        entity: "usuario",
        action: "ACTUALIZAR"
      }
      const params = { ...filters, page: 0, size: 5 }
      expect(TestBed.inject(GetAuditLogsUseCase).execute(params)).toBe(query)
      expect(TestBed.inject(GetAuditLogByIdUseCase).execute(1)).toBe(detail)
      expect(TestBed.inject(ExportAuditLogsUseCase).execute(filters)).toBe(csv)
      expect(repository.getAuditLogs).toHaveBeenCalledExactlyOnceWith(params)
      expect(repository.getAuditLogById).toHaveBeenCalledExactlyOnceWith(1)
      expect(repository.exportAuditLogs).toHaveBeenCalledExactlyOnceWith(filters)
      const result = await firstValueFrom(csv)
      if (result.success) expect(result.data).toBe(blob)
      else expect(result.error).toBe(error)
    })
  }
  it("passes omitted filters without introducing pagination into export", () => {
    const stream = of(Result.success(new Blob(["CSV"])))
    const exportAuditLogs = vi.fn(() => stream)
    TestBed.configureTestingModule({
      providers: [{ provide: AUDIT_LOG_REPOSITORY, useValue: { exportAuditLogs } }]
    })
    expect(TestBed.inject(ExportAuditLogsUseCase).execute()).toBe(stream)
    expect(exportAuditLogs).toHaveBeenCalledExactlyOnceWith(undefined)
  })
})
