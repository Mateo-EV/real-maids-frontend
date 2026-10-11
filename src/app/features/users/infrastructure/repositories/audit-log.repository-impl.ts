import { inject, Injectable } from "@angular/core"
import { AuditFilters, AuditQuery } from "../../domain/models/audit-query"
import { AuditLogRepository } from "../../domain/repositories/audit-log.repository"
import { AuditLogHttpSource } from "../source/audit-log-http.source"
import { of } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { AuditLogError } from "../../domain/errors/audit-log.error"

@Injectable({ providedIn: "root" })
export class AuditLogRepositoryImpl implements AuditLogRepository {
  private readonly source = inject(AuditLogHttpSource)

  getAuditLogById(id: number) {
    return this.source.getAuditLogById(id)
  }

  exportAuditLogs(filters?: AuditFilters) {
    return this.source.exportAuditLogs(filters)
  }

  /** Retired demo API: no fallback, page crawl or reconstructed server CSV. */
  getAllAuditLogs(_filters?: AuditFilters) {
    return of(Result.failure(new AuditLogError("UNSUPPORTED")))
  }

  getAuditLogs(params?: AuditQuery) {
    return this.source.getAuditLogs(params)
  }
}
