import { HttpErrorResponse } from "@angular/common/http"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { dtoRecord } from "@/app/shared/infrastructure/http/dto-validation"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { OperationsError, OperationsErrorCode } from "../../domain/errors/operations.error"
import { ServiceRequestSummary } from "../../domain/models/operations-read.models"
import { ServiceRequestQuery } from "../../domain/params/operations.params"

export const failure = (code: OperationsErrorCode) =>
  new OperationsError(code, "No se pudo consultar la solicitud de servicio.")
function invalid(): never {
  throw failure("INVALID_RESPONSE")
}
const record = (value: unknown) => dtoRecord(value, invalid)
export const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const readId = (value: unknown) => (positiveId(value) ? value : invalid())
const text = (value: unknown) =>
  typeof value === "string" && value.trim().length > 0 ? value : invalid()
const nullableText = (value: unknown) =>
  value === null || typeof value === "string" ? value : invalid()
const states = new Set(["registrada", "atendida", "cancelada"])

function calendar(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}
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

export function requestDto(value: unknown, expectedId?: number): ServiceRequestSummary {
  const p = record(value)
  const id = readId(p["idSolicitud"])
  const status = p["estado"]
  const desiredDate = p["fechaDeseada"]
  if (
    (expectedId !== undefined && id !== expectedId) ||
    typeof status !== "string" ||
    !states.has(status) ||
    (desiredDate !== null && !calendar(desiredDate))
  )
    return invalid()
  return {
    id,
    customerId: readId(p["idCliente"]),
    customerName: text(p["cliente"]),
    propertyId: readId(p["idPropiedad"]),
    propertyName: text(p["propiedad"]),
    serviceTypeId: readId(p["idTipoServicio"]),
    serviceTypeName: text(p["tipoServicio"]),
    description: nullableText(p["descripcion"]),
    desiredDate,
    status,
    registeredByName: text(p["registradoPor"]),
    registeredAt: instant(p["fechaRegistro"]),
    updatedAt: p["fechaActualizacion"] === null ? null : instant(p["fechaActualizacion"])
  }
}

export function requestPagination(query: ServiceRequestQuery) {
  const offset = query.offset === undefined ? 0 : query.offset
  const limit = query.limit === undefined ? 20 : query.limit
  if (
    !integer(offset) ||
    !positiveId(limit) ||
    offset % limit !== 0 ||
    offset / limit > 2147483647 ||
    (query.customerId !== undefined && !positiveId(query.customerId)) ||
    (query.status !== undefined && typeof query.status !== "string") ||
    (query.from !== undefined && !calendar(query.from)) ||
    (query.until !== undefined && !calendar(query.until)) ||
    (query.from !== undefined && query.until !== undefined && query.from > query.until)
  )
    throw failure("INVALID_DATA")
  const status = query.status?.trim().toLowerCase()
  if (status && !states.has(status)) throw failure("INVALID_DATA")
  return {
    pagina: offset / limit,
    tamanio: limit,
    ...(query.customerId !== undefined ? { idCliente: query.customerId } : {}),
    ...(status ? { estado: status } : {}),
    ...(query.from !== undefined ? { desde: query.from } : {}),
    ...(query.until !== undefined ? { hasta: query.until } : {})
  }
}

export function requestPage(
  value: unknown,
  requested: ReturnType<typeof requestPagination>
): PaginationResponse<ServiceRequestSummary> {
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
    p["totalPaginas"] !== Math.ceil(total / size) ||
    !Array.isArray(p["contenido"])
  )
    return invalid()
  const items = p["contenido"].map(item => requestDto(item))
  if (
    new Set(items.map(item => item.id)).size !== items.length ||
    items.length !== Math.min(size, Math.max(0, total - page * size))
  )
    return invalid()
  // Customer scope belongs to the backend; requested idCliente is not a response identity check.
  return { items, total, offset: page * size, limit: size }
}

export function requestError(error: unknown): OperationsError {
  if (error instanceof OperationsError) return failure(error.code)
  if (error instanceof AuthError) {
    if (error.code === "FORBIDDEN" || error.code === "UNCONFIGURED") return failure(error.code)
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
    const codes: Record<number, OperationsErrorCode> = {
      0: "UNAVAILABLE",
      400: "INVALID_DATA",
      401: "UNAUTHENTICATED",
      403: "FORBIDDEN",
      404: "NOT_FOUND",
      409: "CONFLICT"
    }
    return failure(codes[error.status] ?? (error.status >= 500 ? "UNAVAILABLE" : "UNKNOWN"))
  }
  return failure("UNKNOWN")
}
