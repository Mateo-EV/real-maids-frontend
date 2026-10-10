import { inject, Injectable } from "@angular/core"
import { AuditFilters, AuditQuery } from "../../domain/models/audit-query"
import { AuditLogRepository } from "../../domain/repositories/audit-log.repository"
import { AuditLogInMemorySource } from "../source/audit-log-in-memory.source"

@Injectable({ providedIn: "root" })
export class AuditLogRepositoryImpl implements AuditLogRepository {
  private readonly source = inject(AuditLogInMemorySource)

  getAuditLogById(id: number) {
    return this.source.getAuditLogById(id)
  }

  getAllAuditLogs(filters?: AuditFilters) {
    return this.source.getAllAuditLogs(filters)
  }

  getAuditLogs(params?: AuditQuery) {
    return this.source.getAuditLogs(params)
  }
}
