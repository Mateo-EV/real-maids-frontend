import { inject, Injectable } from "@angular/core"
import { AuditFilters } from "../../domain/models/audit-query"
import { AUDIT_LOG_REPOSITORY } from "../../domain/repositories/audit-log.repository"

@Injectable({ providedIn: "root" })
export class ExportAuditLogsUseCase {
  private readonly repository = inject(AUDIT_LOG_REPOSITORY)
  execute(filters?: AuditFilters) {
    return this.repository.exportAuditLogs(filters)
  }
}
