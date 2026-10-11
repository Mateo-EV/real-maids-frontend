import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { AuditLog } from "../entities/audit-log.entity"

export interface AuditPage extends PaginationResponse<AuditLog> {
  readonly page: number
  readonly size: number
  readonly totalPages: number
  readonly globalTotal: number
}
