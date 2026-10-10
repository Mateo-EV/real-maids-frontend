import { PaginationParams } from "@/app/shared/pagination/pagination.params"

export const AUDIT_ENTITIES = [
  "usuario",
  "cliente",
  "orden_servicio",
  "asignacion",
  "sesion"
] as const
export const AUDIT_ACTIONS = [
  "INSERT",
  "UPDATE",
  "DELETE",
  "LOGIN_SUCCESS",
  "REASSIGN_CREW"
] as const
export type AuditEntity = (typeof AUDIT_ENTITIES)[number]
export type AuditAction = (typeof AUDIT_ACTIONS)[number]
export interface AuditFilters {
  /** Exact YYYY-MM-DD calendar day in UTC; omitted means all days. */
  readonly dayUTC?: string
  readonly entity?: AuditEntity
  readonly action?: AuditAction
}
export interface AuditQuery extends PaginationParams, AuditFilters {}
export interface AuditFieldChange {
  readonly field: string
  readonly before: string
  readonly after: string
}

export function validAuditFilters(filters: AuditFilters): boolean {
  const day = filters.dayUTC
  return (
    (day === undefined ||
      (typeof day === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(day) &&
        Number.isFinite(Date.parse(`${day}T00:00:00Z`)) &&
        new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day)) &&
    (filters.entity === undefined || AUDIT_ENTITIES.includes(filters.entity)) &&
    (filters.action === undefined || AUDIT_ACTIONS.includes(filters.action))
  )
}
