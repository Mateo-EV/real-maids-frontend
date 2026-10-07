import { inject, Injectable } from "@angular/core"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { AUDIT_LOG_REPOSITORY } from "../../domain/repositories/audit-log.repository"

@Injectable({ providedIn: "root" })
export class GetAuditLogsUseCase {
  private readonly repository = inject(AUDIT_LOG_REPOSITORY)

  execute(params?: PaginationParams) {
    return this.repository.getAuditLogs(params)
  }
}
