import { inject, Injectable } from "@angular/core"
import { AUDIT_LOG_REPOSITORY } from "../../domain/repositories/audit-log.repository"

@Injectable({ providedIn: "root" })
export class GetAuditLogByIdUseCase {
  private readonly repository = inject(AUDIT_LOG_REPOSITORY)
  execute(id: number) {
    return this.repository.getAuditLogById(id)
  }
}
