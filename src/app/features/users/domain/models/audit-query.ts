import { PaginationParams } from "@/app/shared/pagination/pagination.params"

export const AUDIT_ENTITIES = ["usuario", "rol", "sesion", "cliente"] as const
export const AUDIT_ACTIONS = [
  "LOGIN",
  "LOGIN_FALLIDO",
  "LOGOUT",
  "CREAR",
  "ACTUALIZAR",
  "ACTIVAR",
  "DESACTIVAR",
  "ELIMINAR",
  "CAMBIAR_PASSWORD",
  "RESTABLECER_PASSWORD",
  "ASIGNAR_PERMISOS",
  "REVOCAR_SESION",
  "REVOCAR_SESIONES",
  "TOKEN_REUTILIZADO"
] as const
// Catalog suggestions are not an ACL or a closed backend enum.
export type AuditEntity = string
export type AuditAction = string
export interface AuditFilters {
  readonly userId?: number
  /** YYYY-MM-DD UTC calendar days, both endpoints inclusive. */
  readonly fromUTC?: string
  readonly toUTC?: string
  /** Legacy single UTC day, equivalent to fromUTC = toUTC. */
  readonly dayUTC?: string
  readonly entity?: string
  readonly action?: string
}
export interface AuditQuery extends PaginationParams, AuditFilters {
  readonly page?: number
  readonly size?: number
}
export interface AuditFieldChange {
  readonly field: string
  readonly before: string | null
  readonly after: string | null
}
export function validAuditDay(day: unknown): day is string {
  return (
    typeof day === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(Date.parse(`${day}T00:00:00Z`)) &&
    new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day
  )
}
export function validAuditFilters(filters: AuditFilters): boolean {
  return (
    (filters.userId === undefined ||
      (Number.isInteger(filters.userId) &&
        filters.userId >= -2147483648 &&
        filters.userId <= 2147483647)) &&
    (filters.dayUTC === undefined || validAuditDay(filters.dayUTC)) &&
    (filters.fromUTC === undefined || validAuditDay(filters.fromUTC)) &&
    (filters.toUTC === undefined || validAuditDay(filters.toUTC)) &&
    !(
      filters.dayUTC !== undefined &&
      (filters.fromUTC !== undefined || filters.toUTC !== undefined)
    ) &&
    !(
      filters.fromUTC !== undefined &&
      filters.toUTC !== undefined &&
      filters.fromUTC > filters.toUTC
    ) &&
    [filters.entity, filters.action].every(
      value => value === undefined || (typeof value === "string" && value.trim().length > 0)
    )
  )
}
