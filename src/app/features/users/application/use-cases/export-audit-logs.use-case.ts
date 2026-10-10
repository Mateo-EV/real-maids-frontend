import { inject, Injectable } from "@angular/core"
import { map } from "rxjs"
import { AuditFilters } from "../../domain/models/audit-query"
import { AUDIT_LOG_REPOSITORY } from "../../domain/repositories/audit-log.repository"
import { serializeAuditCsv } from "../helpers/audit-csv"

@Injectable({ providedIn: "root" })
export class ExportAuditLogsUseCase {
  private readonly repository = inject(AUDIT_LOG_REPOSITORY)
  execute(filters?: AuditFilters) {
    return this.repository
      .getAllAuditLogs(filters)
      .pipe(map(result => result.map(serializeAuditCsv)))
  }
}
