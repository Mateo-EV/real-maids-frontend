import { inject, Injectable } from "@angular/core"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { AuditLogRepository } from "../../domain/repositories/audit-log.repository"
import { AuditLogInMemorySource } from "../source/audit-log-in-memory.source"

@Injectable({ providedIn: "root" })
export class AuditLogRepositoryImpl implements AuditLogRepository {
  private readonly source = inject(AuditLogInMemorySource)

  getAuditLogs(params?: PaginationParams) {
    return this.source.getAuditLogs(params)
  }
}
