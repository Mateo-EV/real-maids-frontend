import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { AuditFilters, AuditQuery } from "../models/audit-query"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { AuditLog } from "../entities/audit-log.entity"
import { AuditLogError } from "../errors/audit-log.error"

export interface AuditLogRepository {
  getAuditLogs(params?: AuditQuery): Observable<Result<PaginationResponse<AuditLog>, AuditLogError>>
  getAuditLogById(id: number): Observable<Result<AuditLog, AuditLogError>>
  /** Complete filtered query, deliberately independent of the paginated read cap. */
  getAllAuditLogs(filters?: AuditFilters): Observable<Result<AuditLog[], AuditLogError>>
}

export const AUDIT_LOG_REPOSITORY = new InjectionToken<AuditLogRepository>("audit-log.repository")
