import { HttpErrorResponse } from "@angular/common/http"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { dtoRecord } from "@/app/shared/infrastructure/http/dto-validation"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import {
  CustomerSupportError,
  CustomerSupportErrorCode
} from "../../domain/errors/customer-support.error"
import {
  SUPPORT_STATE_CODES,
  SupportDetail,
  SupportFollowUpView,
  SupportRequestTypeView,
  SupportRequestView,
  SupportStateCode
} from "../../domain/models/support-views"
import { SupportRequestQuery } from "../../domain/params/customer-support.params"

export const failure = (code: CustomerSupportErrorCode) => new CustomerSupportError(code)
function invalid(): never {
  throw failure("INVALID_RESPONSE")
}
function invalidInput(): never {
  throw failure("VALIDATION")
}
const record = (value: unknown) => dtoRecord(value, invalid)
const supportStates = new Set<string>(SUPPORT_STATE_CODES)

export const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const readId = (value: unknown) => (positiveId(value) ? value : invalid())
// Literal text is preserved; only a blank required value is rejected.
const text = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value : invalid()
const nullableText = (value: unknown) =>
  value === null || typeof value === "string" ? value : invalid()
const flag = (value: unknown) => (typeof value === "boolean" ? value : invalid())
function list<T>(value: unknown, read: (item: unknown) => T): T[] {
  return Array.isArray(value) ? value.map(read) : invalid()
}

function calendar(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

// OffsetDateTime wire strings become Date; the instant is never re-zoned here.
function instant(value: unknown): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value
    ) ||
    !calendar(value.slice(0, 10))
  )
    return invalid()
  if (!value.endsWith("Z")) {
    const [hours, minutes] = value.slice(-5).split(":").map(Number)
    if (hours > 18 || minutes > 59 || (hours === 18 && minutes !== 0)) return invalid()
  }
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : invalid()
}

export function requestView(value: unknown, expectedId?: number): SupportRequestView {
  const p = record(value)
  const id = readId(p["idAtencion"])
  const state = p["estado"]
  if (expectedId !== undefined && id !== expectedId) return invalid()
  // The documented wire enum is the only valid state; there is no status catalog.
  if (typeof state !== "string" || !supportStates.has(state)) return invalid()
  return {
    id,
    customerId: readId(p["idCliente"]),
    customerName: text(p["cliente"]),
    orderId: p["idOrden"] === null ? null : readId(p["idOrden"]),
    orderCode: nullableText(p["codigoOrden"]),
    requestTypeId: readId(p["idTipo"]),
    requestTypeName: text(p["tipo"]),
    requiresResponse: flag(p["requiereRespuesta"]),
    state: state as SupportStateCode,
    stateName: text(p["estadoNombre"]),
    subject: text(p["asunto"]),
    description: text(p["descripcion"]),
    registeredAt: instant(p["fechaRegistro"]),
    closedAt: p["fechaCierre"] === null ? null : instant(p["fechaCierre"])
  }
}

// `autor` is null when the backend redacts staff authors; null is preserved as-is.
export function followUpView(value: unknown): SupportFollowUpView {
  const p = record(value)
  return {
    id: readId(p["idSeguimiento"]),
    author: nullableText(p["autor"]),
    isFromCustomer: flag(p["delCliente"]),
    message: text(p["mensaje"]),
    createdAt: instant(p["fecha"])
  }
}

export function requestDetail(value: unknown, expectedId: number): SupportDetail {
  const p = record(value)
  const request = requestView(p["atencion"], expectedId)
  const followUps = list(p["seguimiento"], followUpView)
  if (new Set(followUps.map(item => item.id)).size !== followUps.length) return invalid()
  return { request, followUps }
}

export function requestTypes(value: unknown): SupportRequestTypeView[] {
  const seen = new Set<number>()
  return list(value, item => {
    const p = record(item)
    const id = readId(p["idTipo"])
    if (seen.has(id)) return invalid()
    seen.add(id)
    return { id, name: text(p["nombre"]), requiresResponse: flag(p["requiereRespuesta"]) }
  })
}

export function requestPagination(query: SupportRequestQuery) {
  const offset = query.offset === undefined ? 0 : query.offset
  const limit = query.limit === undefined ? 20 : query.limit
  if (
    !integer(offset) ||
    !positiveId(limit) ||
    offset % limit !== 0 ||
    offset / limit > 2147483647 ||
    (query.state !== undefined && typeof query.state !== "string") ||
    (query.requestTypeId !== undefined && !positiveId(query.requestTypeId)) ||
    (query.customerId !== undefined && !positiveId(query.customerId)) ||
    (query.fromDate !== undefined && !calendar(query.fromDate)) ||
    (query.toDate !== undefined && !calendar(query.toDate)) ||
    (query.fromDate !== undefined && query.toDate !== undefined && query.fromDate > query.toDate)
  )
    return invalidInput()
  const state = query.state?.trim().toUpperCase()
  if (state && !supportStates.has(state)) return invalidInput()
  return {
    pagina: offset / limit,
    tamanio: limit,
    ...(state ? { estado: state } : {}),
    ...(query.requestTypeId !== undefined ? { idTipo: query.requestTypeId } : {}),
    ...(query.customerId !== undefined ? { idCliente: query.customerId } : {}),
    ...(query.fromDate !== undefined ? { desde: query.fromDate } : {}),
    ...(query.toDate !== undefined ? { hasta: query.toDate } : {})
  }
}

export function requestPage(
  value: unknown,
  requested: ReturnType<typeof requestPagination>
): PaginationResponse<SupportRequestView> {
  const p = record(value)
  const page = p["pagina"],
    size = p["tamanio"],
    total = p["totalElementos"]
  if (
    !integer(page) ||
    page !== requested.pagina ||
    !positiveId(size) ||
    size > Math.min(100, requested.tamanio) ||
    !integer(total) ||
    !Number.isSafeInteger(page * size) ||
    !integer(p["totalPaginas"]) ||
    p["totalPaginas"] !== Math.ceil(total / size)
  )
    return invalid()
  const items = list(p["contenido"], item => requestView(item))
  if (
    new Set(items.map(item => item.id)).size !== items.length ||
    items.length !== Math.min(size, Math.max(0, total - page * size))
  )
    return invalid()
  // The caller-relative customer scope belongs to the backend, never inferred here.
  return { items, total, offset: page * size, limit: size }
}

export function requestError(error: unknown): CustomerSupportError {
  if (error instanceof CustomerSupportError) return failure(error.code)
  if (error instanceof AuthError) {
    if (error.code === "FORBIDDEN") return failure("FORBIDDEN")
    if (
      [
        "INVALID_CREDENTIALS",
        "COORDINATION",
        "CANCELLED",
        "INVALID_ACCESS",
        "INVALID_REFRESH"
      ].includes(error.code)
    )
      return failure("UNAUTHENTICATED")
    return failure("UNAVAILABLE")
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status >= 200 && error.status < 300) return failure("INVALID_RESPONSE")
    const codes: Record<number, CustomerSupportErrorCode> = {
      0: "UNAVAILABLE",
      400: "VALIDATION",
      401: "UNAUTHENTICATED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT"
    }
    return failure(codes[error.status] ?? (error.status >= 500 ? "UNAVAILABLE" : "UNEXPECTED"))
  }
  return failure("UNEXPECTED")
}
