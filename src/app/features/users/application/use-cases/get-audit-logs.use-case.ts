import { inject, Injectable } from "@angular/core"
import { AuditQuery } from "../../domain/models/audit-query"
import { AUDIT_LOG_REPOSITORY } from "../../domain/repositories/audit-log.repository"

@Injectable({ providedIn: "root" })
export class GetAuditLogsUseCase {
  private readonly repository = inject(AUDIT_LOG_REPOSITORY)

  execute(params?: AuditQuery) {
    return this.repository.getAuditLogs(params)
  }
}
