import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { AuditFilters, AuditQuery } from "../models/audit-query"
import { AuditPage } from "../models/audit-page"
import { AuditLog } from "../entities/audit-log.entity"
import { AuditLogError } from "../errors/audit-log.error"

export interface AuditLogRepository {
  getAuditLogs(params?: AuditQuery): Observable<Result<AuditPage, AuditLogError>>
  getAuditLogById(id: number): Observable<Result<AuditLog, AuditLogError>>
  /** Backend CSV bytes for every match (server limit: 10000), never reconstructed from a page. */
  exportAuditLogs(filters?: AuditFilters): Observable<Result<Blob, AuditLogError>>
}

export const AUDIT_LOG_REPOSITORY = new InjectionToken<AuditLogRepository>("audit-log.repository")
