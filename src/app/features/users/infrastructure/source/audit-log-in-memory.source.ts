import { Injectable } from "@angular/core"
import { map, Observable, timer } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { normalizePagination } from "@/app/shared/pagination/normalize-pagination"
import { AuditLog } from "../../domain/entities/audit-log.entity"
import { AuditLogError } from "../../domain/errors/audit-log.error"
import {
  AuditFilters,
  AuditQuery,
  validAuditFilters as validFilters
} from "../../domain/models/audit-query"

// Legacy fixture catalog stays isolated from the documented backend catalog.
const AUDIT_ENTITIES = ["usuario", "cliente", "orden_servicio", "asignacion", "sesion"]
const validAuditFilters = (filters: AuditFilters) =>
  validFilters(filters) &&
  (filters.entity === undefined || AUDIT_ENTITIES.includes(filters.entity)) &&
  (filters.action === undefined ||
    ["INSERT", "UPDATE", "DELETE", "LOGIN_SUCCESS", "REASSIGN_CREW"].includes(filters.action))

const cloneAuditLog = (log: AuditLog): AuditLog =>
  AuditLog.create(
    log.id,
    log.userId,
    log.entity,
    log.action,
    log.details,
    log.ip,
    new Date(log.date.getTime()),
    log.actor,
    log.recordId,
    log.changes?.map(change => ({ ...change }))
  )
const copyFilters = (filters?: AuditFilters): AuditFilters => ({
  dayUTC: filters?.dayUTC,
  entity: filters?.entity,
  action: filters?.action
})

@Injectable({ providedIn: "root" })
export class AuditLogInMemorySource {
  // FICTITIOUS DEMO DATA — no real actor identity, monitoring or automatic CRUD/RBAC logging.
  // Public synthetic metadata only: never credentials, door codes or payment information.
  private readonly logs = Array.from({ length: 48 }, (_, index) => {
    const entity = AUDIT_ENTITIES[index % AUDIT_ENTITIES.length]
    const action =
      entity === "sesion"
        ? "LOGIN_SUCCESS"
        : entity === "asignacion"
          ? "REASSIGN_CREW"
          : ["INSERT", "UPDATE", "DELETE"][Math.floor(index / 5) % 3]
    const changes =
      action === "UPDATE"
        ? [
            {
              field: "Estado",
              before: entity === "orden_servicio" ? "Pendiente" : "Activo",
              after: entity === "orden_servicio" ? "Programada" : "Inactivo"
            }
          ]
        : action === "REASSIGN_CREW"
          ? [{ field: "Equipo", before: `Equipo ${index + 1}`, after: `Equipo ${index + 2}` }]
          : undefined
    return AuditLog.create(
      index + 1,
      (index % 5) + 1,
      entity,
      action,
      `FICTITIOUS DEMO DATA: ${action} de ${entity}, registro ${index + 1}`,
      `192.0.2.${index + 1}`,
      new Date(
        index === 29
          ? "2026-09-01T23:59:59Z"
          : index === 30
            ? "2026-09-02T00:00:00Z"
            : Date.UTC(2026, 8, 1 + Math.floor(index / 30), 0, Math.floor(index / 3))
      ),
      ["Carlos Mendoza", "Laura Sánchez", "María Rodríguez", "Johnathan Taylor", "David Gómez"][
        index % 5
      ],
      `${entity.toUpperCase()}-${String(index + 1).padStart(3, "0")}`,
      changes
    )
  })

  private filtered(filters: AuditFilters): AuditLog[] {
    return this.logs
      .filter(
        log =>
          (!filters.dayUTC || log.date.toISOString().slice(0, 10) === filters.dayUTC) &&
          (!filters.entity || log.entity === filters.entity) &&
          (!filters.action || log.action === filters.action)
      )
      .sort((a, b) => b.date.getTime() - a.date.getTime() || b.id - a.id)
  }

  getAuditLogs(
    params?: AuditQuery
  ): Observable<Result<PaginationResponse<AuditLog>, AuditLogError>> {
    const input = { offset: params?.offset, limit: params?.limit }
    const filters = copyFilters(params)
    return timer(250).pipe(
      map(() => {
        const pagination = normalizePagination(input)
        if (!pagination.success) return Result.failure(new AuditLogError("INVALID_PAGINATION"))
        if (!validAuditFilters(filters)) return Result.failure(new AuditLogError("INVALID_FILTER"))
        const { offset, limit } = pagination.data
        const ordered = this.filtered(filters)
        return Result.success({
          items: ordered.slice(offset, offset + limit).map(cloneAuditLog),
          total: ordered.length,
          offset,
          limit
        })
      })
    )
  }

  getAllAuditLogs(filters?: AuditFilters): Observable<Result<AuditLog[], AuditLogError>> {
    const input = copyFilters(filters)
    return timer(250).pipe(
      map(() =>
        validAuditFilters(input)
          ? Result.success(this.filtered(input).map(cloneAuditLog))
          : Result.failure(new AuditLogError("INVALID_FILTER"))
      )
    )
  }

  getAuditLogById(id: number): Observable<Result<AuditLog, AuditLogError>> {
    return timer(250).pipe(
      map(() => {
        const log = this.logs.find(item => item.id === id)
        return log
          ? Result.success(cloneAuditLog(log))
          : Result.failure(new AuditLogError("AUDIT_LOG_NOT_FOUND"))
      })
    )
  }
}
