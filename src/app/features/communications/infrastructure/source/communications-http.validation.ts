import { HttpErrorResponse } from "@angular/common/http"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { dtoDate, dtoRecord } from "@/app/shared/infrastructure/http/dto-validation"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { CommunicationsError } from "../../domain/errors/communications.error"

export function invalid(): never {
  throw new CommunicationsError("INVALID_RESPONSE")
}
export function input(valid: boolean): void {
  if (!valid) throw new CommunicationsError("INVALID_INPUT")
}
export const record = (v: unknown) => dtoRecord(v, invalid)
/** SQL INT identity: a positive int32, never a coerced float. */
export const id = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0 && v <= 2147483647
export const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0
export function readId(v: unknown): number {
  return id(v) ? v : invalid()
}
export function nullableId(v: unknown): number | null {
  return v === null ? null : readId(v)
}
export function text(v: unknown): string {
  return typeof v === "string" && v.trim().length > 0 ? v : invalid()
}
export function nullableText(v: unknown): string | null {
  return v === null ? null : text(v)
}
export function required(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null
  const trimmed = v.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null
}
export const date = (v: unknown) => dtoDate(v, invalid)
export const nullableDate = (v: unknown) => (v === null ? null : date(v))
export function array<T>(v: unknown, parse: (v: unknown) => T): T[] {
  return Array.isArray(v) ? v.map(parse) : invalid()
}
export function list<T extends { id: number }>(v: unknown, parse: (v: unknown) => T): T[] {
  const items = array(v, parse)
  if (new Set(items.map(item => item.id)).size !== items.length) invalid()
  return items
}
export function pagination(offset = 0, limit = 20) {
  input(
    integer(offset) &&
      integer(limit) &&
      limit > 0 &&
      limit <= 2147483647 &&
      offset % limit === 0 &&
      offset / limit <= 2147483647
  )
  return { pagina: offset / limit, tamanio: limit }
}
/**
 * The documented CRM envelope. A page the server answers with another offset or a size above the
 * requested one proves the client asked for something else, so it is an invalid response instead of a
 * silently adopted page.
 */
export function page<T extends { id: number }>(
  v: unknown,
  parse: (v: unknown) => T,
  requestedPage: number,
  requestedSize: number
): PaginationResponse<T> {
  const p = record(v),
    number = p["pagina"],
    size = p["tamanio"],
    total = p["totalElementos"]
  if (
    !integer(number) ||
    number !== requestedPage ||
    !integer(size) ||
    size < 1 ||
    size > Math.min(100, requestedSize) ||
    !integer(total) ||
    !Number.isSafeInteger(number * size) ||
    p["totalPaginas"] !== Math.ceil(total / size)
  )
    return invalid()
  const items = list(p["contenido"], parse)
  if (items.length !== Math.min(size, Math.max(0, total - number * size))) invalid()
  return { items, offset: number * size, limit: size, total }
}
export function errorCode(error: unknown): CommunicationsError["code"] {
  if (error instanceof CommunicationsError) return error.code
  if (error instanceof AuthError) {
    if (error.code === "FORBIDDEN" || error.code === "NETWORK" || error.code === "UNCONFIGURED")
      return error.code
    if (["INVALID_CREDENTIALS", "COORDINATION", "CANCELLED"].includes(error.code))
      return "UNAUTHENTICATED"
  }
  if (error instanceof HttpErrorResponse) {
    switch (error.status) {
      case 0:
        return "NETWORK"
      case 400:
        return "INVALID_INPUT"
      case 401:
        return "UNAUTHENTICATED"
      case 403:
        return "FORBIDDEN"
      case 404:
        return "NOT_FOUND"
      case 409:
        return "CONFLICT"
    }
  }
  return "UNEXPECTED"
}
