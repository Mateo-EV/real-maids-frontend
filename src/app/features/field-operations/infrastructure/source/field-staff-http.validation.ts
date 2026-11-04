import { HttpErrorResponse } from "@angular/common/http"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { dtoRecord } from "@/app/shared/infrastructure/http/dto-validation"
import {
  FieldOperationsError,
  FieldOperationsErrorCode
} from "../../domain/errors/field-operations.error"
import { FieldStaffSummary } from "../../domain/models/field-staff-summary"
import { FieldStaffQuery } from "../../domain/params/field-operations.params"

export const failure = (code: FieldOperationsErrorCode) =>
  new FieldOperationsError(code, "Staff request could not be completed")
export function invalid(): never {
  throw failure("INVALID_RESPONSE")
}
const record = (v: unknown) => dtoRecord(v, invalid)
export const positiveId = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= 2147483647
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0
const readId = (v: unknown) => (positiveId(v) ? v : invalid())
const text = (v: unknown, max: number) =>
  typeof v === "string" && v.trim().length > 0 && v.length <= max ? v : invalid()
const nullableText = (v: unknown, max: number) =>
  v === null ? null : typeof v === "string" && v.length <= max ? v : invalid()
const flag = (v: unknown) => (typeof v === "boolean" ? v : invalid())
function calendar(v: unknown): string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return invalid()
  const [year, month, day] = v.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] ? v : invalid()
}
function time(v: unknown): string {
  return typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/.test(v)
    ? v
    : invalid()
}
function instant(v: unknown): Date {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(v)
  )
    return invalid()
  calendar(v.slice(0, 10))
  const clock = v.slice(11).replace(/(?:Z|[+-]\d{2}:\d{2})$/, "")
  time(clock)
  if (!v.endsWith("Z")) {
    const offset = v.slice(-5).split(":").map(Number)
    if (offset[0] > 18 || offset[1] > 59 || (offset[0] === 18 && offset[1] !== 0)) return invalid()
  }
  const date = new Date(v)
  return Number.isFinite(date.getTime()) ? date : invalid()
}
const weekdays = new Set(["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"])
export function staffDto(
  v: unknown,
  expectedId?: number,
  callerId?: number | null
): FieldStaffSummary {
  const p = record(v)
  if (!Array.isArray(p["disponibilidad"])) return invalid()
  const availability = p["disponibilidad"].map(value => {
    const slot = record(value),
      weekday = slot["dia"]
    if (typeof weekday !== "string" || !weekdays.has(weekday)) return invalid()
    return { weekday, startTime: time(slot["horaInicio"]), endTime: time(slot["horaFin"]) }
  })
  const id = readId(p["idPersonal"]),
    userId = p["idUsuario"] === null ? null : readId(p["idUsuario"])
  if ((expectedId !== undefined && id !== expectedId) || (callerId != null && userId !== callerId))
    return invalid()
  return {
    id,
    name: text(p["nombre"], 150),
    document: text(p["documento"], 30),
    phone: nullableText(p["telefono"], 30),
    email: nullableText(p["correo"], 120),
    language: text(p["idioma"], 5),
    joinedOn: p["fechaIngreso"] === null ? null : calendar(p["fechaIngreso"]),
    isActive: flag(p["activo"]),
    userId,
    availability,
    createdAt: instant(p["fechaCreacion"])
  }
}
export function staffPagination(query: FieldStaffQuery) {
  const offset = query.offset ?? 0,
    limit = query.limit ?? 20
  if (
    !integer(offset) ||
    !integer(limit) ||
    limit < 1 ||
    limit > 2147483647 ||
    offset % limit !== 0 ||
    offset / limit > 2147483647 ||
    (query.search !== undefined && typeof query.search !== "string") ||
    (query.isActive !== undefined && typeof query.isActive !== "boolean")
  )
    throw failure("INVALID_DATA")
  return {
    pagina: offset / limit,
    tamanio: limit,
    ...(query.search?.trim() ? { busqueda: query.search.trim() } : {}),
    ...(query.isActive !== undefined ? { activo: query.isActive } : {})
  }
}
export function staffPage(v: unknown, requested: ReturnType<typeof staffPagination>) {
  const p = record(v),
    page = p["pagina"],
    size = p["tamanio"],
    total = p["totalElementos"]
  if (
    !integer(page) ||
    page !== requested.pagina ||
    !integer(size) ||
    size < 1 ||
    size > Math.min(100, requested.tamanio) ||
    !integer(total) ||
    !Number.isSafeInteger(page * size) ||
    p["totalPaginas"] !== Math.ceil(total / size) ||
    !Array.isArray(p["contenido"])
  )
    return invalid()
  const items = p["contenido"].map(v => staffDto(v))
  if (
    new Set(items.map(item => item.id)).size !== items.length ||
    items.length !== Math.min(size, Math.max(0, total - page * size))
  )
    return invalid()
  return { items, total, offset: page * size, limit: size }
}
export function staffError(error: unknown): FieldOperationsError {
  if (error instanceof FieldOperationsError) return error
  if (error instanceof AuthError) {
    if (error.code === "FORBIDDEN" || error.code === "UNCONFIGURED") return failure(error.code)
    if (error.code === "NETWORK") return failure("UNAVAILABLE")
    if (["INVALID_CREDENTIALS", "COORDINATION", "CANCELLED"].includes(error.code))
      return failure("UNAUTHENTICATED")
  }
  if (error instanceof HttpErrorResponse) {
    const code: Record<number, FieldOperationsErrorCode> = {
      0: "UNAVAILABLE",
      400: "INVALID_DATA",
      401: "UNAUTHENTICATED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      405: "UNSUPPORTED",
      409: "CONFLICT"
    }
    return failure(code[error.status] ?? "UNKNOWN")
  }
  return failure("UNKNOWN")
}
