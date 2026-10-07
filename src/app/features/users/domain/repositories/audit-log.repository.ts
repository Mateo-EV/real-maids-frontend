import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { AuditLog } from "../entities/audit-log.entity"
import { AuditLogError } from "../errors/audit-log.error"

export interface AuditLogRepository {
  getAuditLogs(
    params?: PaginationParams
  ): Observable<Result<PaginationResponse<AuditLog>, AuditLogError>>
}

export const AUDIT_LOG_REPOSITORY = new InjectionToken<AuditLogRepository>("audit-log.repository")
