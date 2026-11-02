import { HttpErrorResponse } from "@angular/common/http"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { dtoDate, dtoRecord } from "@/app/shared/infrastructure/http/dto-validation"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { CustomerError, CustomerErrorCode } from "../../domain/errors/customer.error"

export function invalid(): never {
  throw new CustomerError("INVALID_RESPONSE")
}
export function input(valid: boolean): void {
  if (!valid) throw new CustomerError("INVALID_INPUT")
}
export const record = (v: unknown) => dtoRecord(v, invalid)
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
export function text(v: unknown, max = Infinity): string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max ? v : invalid()
}
export function nullableText(v: unknown, max = Infinity): string | null {
  return v === null ? null : text(v, max)
}
export function flag(v: unknown): boolean {
  return typeof v === "boolean" ? v : invalid()
}
export const date = (v: unknown) => dtoDate(v, invalid)
export const nullableDate = (v: unknown) => (v === null ? null : date(v))
export function sameId<T extends { id: number }>(value: T, expected?: number): T {
  if (expected !== undefined && value.id !== expected) invalid()
  return value
}
export function owned<T extends { customerId: number }>(value: T, owner: number): T {
  if (value.customerId !== owner) invalid()
  return value
}
export function list<T extends { id: number }>(v: unknown, parse: (v: unknown) => T): T[] {
  if (!Array.isArray(v)) return invalid()
  const items = v.map(parse)
  if (new Set(items.map(item => item.id)).size !== items.length) invalid()
  return items
}
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
export function required(v: unknown, max = Infinity): v is string {
  return typeof v === "string" && v.trim().length > 0 && v.length <= max
}
export function optional(v: unknown, max = Infinity): v is string | null {
  return v === null || (typeof v === "string" && v.length <= max)
}
export function email(v: unknown): boolean {
  return optional(v, 120) && (v === null || v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
}
/** Only bounded DECIMAL values with two fraction digits, not arbitrary BigDecimal transport. */
export function decimal(v: unknown, max = 999999.99, min = 1): string {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return invalid()
  const canonical = v.toFixed(2)
  if (Number(canonical) !== v) return invalid()
  return canonical
}
export function errorCode(error: unknown, notFound: CustomerErrorCode): CustomerErrorCode {
  if (error instanceof CustomerError) return error.code
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
        return notFound
      case 409:
        return "CONFLICT"
    }
  }
  return "UNEXPECTED"
}
