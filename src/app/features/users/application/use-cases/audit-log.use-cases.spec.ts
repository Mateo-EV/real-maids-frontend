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

describe("Audit detail and complete export use cases", () => {
  it("exports all filtered results without a paginated read or a 100-row ceiling", async () => {
    const logs = Array.from({ length: 130 }, (_, index) =>
      AuditLog.create(index + 1, 1, "usuario", "INSERT", "Demo", "192.0.2.1", new Date(0))
    )
    const getAuditLogs = vi.fn(),
      getAllAuditLogs = vi.fn(() => of(Result.success(logs)))
    TestBed.configureTestingModule({
      providers: [{ provide: AUDIT_LOG_REPOSITORY, useValue: { getAuditLogs, getAllAuditLogs } }]
    })
    const filters = { entity: "usuario" as const }
    const result = await firstValueFrom(TestBed.inject(ExportAuditLogsUseCase).execute(filters))
    expect(getAllAuditLogs).toHaveBeenCalledExactlyOnceWith(filters)
    expect(getAuditLogs).not.toHaveBeenCalled()
    if (!result.success) throw result.error
    expect(result.data.split("\r\n")).toHaveLength(131)
  })
  it("preserves typed failures and exact ID for detail and export", async () => {
    const error = new AuditLogError("AUDIT_LOG_NOT_FOUND")
    const response = of(Result.failure(error))
    const getAuditLogById = vi.fn(() => response),
      getAllAuditLogs = vi.fn(() => response)
    TestBed.configureTestingModule({
      providers: [{ provide: AUDIT_LOG_REPOSITORY, useValue: { getAuditLogById, getAllAuditLogs } }]
    })
    expect(TestBed.inject(GetAuditLogByIdUseCase).execute(42)).toBe(response)
    expect(getAuditLogById).toHaveBeenCalledExactlyOnceWith(42)
    const result = await firstValueFrom(TestBed.inject(ExportAuditLogsUseCase).execute())
    expect(result).toMatchObject({ success: false, error })
  })
})

for (const success of [true, false]) {
  describe(`Audit query ${success ? "success" : "failure"} delegation`, () => {
    for (const params of [undefined, { offset: 4, limit: 2 }]) {
      it(`preserves exact observable and Result with ${params ? "explicit" : "omitted"} params`, async () => {
        const result = success
          ? Result.success({
              items: [
                AuditLog.create(1, 1, "Demo", "Demo", "Fictitious", "192.0.2.1", new Date(0))
              ],
              total: 1,
              offset: 4,
              limit: 2
            })
          : Result.failure(new AuditLogError("INVALID_PAGINATION"))
        const stream = of(result)
        const repository: AuditLogRepository = {
          getAuditLogs: vi.fn(() => stream),
          getAllAuditLogs: vi.fn(() => of(Result.success([]))),
          getAuditLogById: vi.fn(() => of(Result.failure(new AuditLogError("AUDIT_LOG_NOT_FOUND"))))
        }
        TestBed.configureTestingModule({
          providers: [{ provide: AUDIT_LOG_REPOSITORY, useValue: repository }]
        })
        const returned = TestBed.inject(GetAuditLogsUseCase).execute(params)
        expect(returned).toBe(stream)
        expect(repository.getAuditLogs).toHaveBeenCalledExactlyOnceWith(params)
        expect(await firstValueFrom(returned)).toBe(result)
      })
    }
  })
}
