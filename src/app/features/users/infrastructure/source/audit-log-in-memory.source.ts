import { Injectable } from "@angular/core"
import { map, Observable, timer } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { normalizePagination } from "@/app/shared/pagination/normalize-pagination"
import { AuditLog } from "../../domain/entities/audit-log.entity"
import { AuditLogError } from "../../domain/errors/audit-log.error"

const cloneAuditLog = (log: AuditLog): AuditLog =>
  AuditLog.create(
    log.id,
    log.userId,
    log.entity,
    log.action,
    log.details,
    log.ip,
    new Date(log.date.getTime())
  )

@Injectable({ providedIn: "root" })
export class AuditLogInMemorySource {
  // FICTITIOUS DEMO DATA — not monitored activity, sessions, permissions or an API contract.
  // Source-owned stable records; duplicate timestamps exercise the deterministic ID tie-break.
  private readonly logs = Array.from({ length: 48 }, (_, index) =>
    AuditLog.create(
      index + 1,
      (index % 48) + 1,
      "Demo profile",
      "Demo query",
      `FICTITIOUS DEMO DATA: synthetic audit record ${index + 1}`,
      `192.0.2.${index + 1}`,
      new Date(Date.UTC(2026, 8, 1, 12, Math.floor(index / 3)))
    )
  )

  getAuditLogs(
    params?: PaginationParams
  ): Observable<Result<PaginationResponse<AuditLog>, AuditLogError>> {
    const input = { offset: params?.offset, limit: params?.limit }
    return timer(250).pipe(
      map(() => {
        const pagination = normalizePagination(input)
        if (!pagination.success) return Result.failure(new AuditLogError("INVALID_PAGINATION"))
        const { offset, limit } = pagination.data
        const ordered = [...this.logs].sort(
          (a, b) => b.date.getTime() - a.date.getTime() || b.id - a.id
        )
        return Result.success({
          items: ordered.slice(offset, offset + limit).map(cloneAuditLog),
          total: ordered.length,
          offset,
          limit
        })
      })
    )
  }
}
