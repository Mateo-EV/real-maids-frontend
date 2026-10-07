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
        const repository: AuditLogRepository = { getAuditLogs: vi.fn(() => stream) }
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
