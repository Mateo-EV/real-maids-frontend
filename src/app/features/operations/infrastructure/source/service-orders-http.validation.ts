import { dtoRecord, dtoText } from "@/app/shared/infrastructure/http/dto-validation"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { OperationsError } from "../../domain/errors/operations.error"
import {
  AssignedStaffSummary,
  OrderPropertySummary,
  OrderStatusHistorySummary,
  ScheduleSummary,
  ServiceOrderDetail,
  ServiceOrderSummary
} from "../../domain/models/operations-read.models"
import { ServiceOrderQuery } from "../../domain/params/operations.params"
import { positiveId } from "./service-requests-http.validation"

function invalid(): never {
  throw new OperationsError("INVALID_RESPONSE", "La respuesta de órdenes no es válida.")
}
const record = (v: unknown) => dtoRecord(v, invalid)
const id = (v: unknown) => (positiveId(v) ? v : invalid())
const text = (v: unknown) => (dtoText(v) ? v : invalid())
const nullableText = (v: unknown) => (v === null || typeof v === "string" ? v : invalid())
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0
const flag = (v: unknown) => (typeof v === "boolean" ? v : invalid())
function calendar(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const date = new Date(v + "T00:00:00Z")
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v
}
function clock(v: unknown): string {
  return typeof v === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/.test(v)
    ? v
    : invalid()
}
function instant(v: unknown): Date {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      v
    ) ||
    !calendar(v.slice(0, 10))
  )
    return invalid()
  if (!v.endsWith("Z")) {
    const [hours, minutes] = v.slice(-5).split(":").map(Number)
    if (hours > 18 || minutes > 59 || (hours === 18 && minutes !== 0)) return invalid()
  }
  const date = new Date(v)
  return Number.isFinite(date.getTime()) ? date : invalid()
}
function decimal(v: unknown, max: number, min: number): string {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) return invalid()
  const canonical = v.toFixed(2)
  return Number(canonical) === v ? canonical : invalid()
}
function count(v: unknown, max: number): number | null {
  return v === null ? null : integer(v) && v <= max ? v : invalid()
}
function list<T>(v: unknown, read: (item: unknown) => T): T[] {
  return Array.isArray(v) ? v.map(read) : invalid()
}
function unique<T>(items: T[], key: (item: T) => number): T[] {
  return new Set(items.map(key)).size === items.length ? items : invalid()
}
function assigned(v: unknown): AssignedStaffSummary {
  const p = record(v)
  return {
    staffId: id(p["idPersonal"]),
    name: text(p["nombre"]),
    phone: nullableText(p["telefono"]),
    role: text(p["rol"])
  }
}
function schedule(v: unknown): ScheduleSummary {
  const p = record(v)
  if (!calendar(p["fecha"])) return invalid()
  return {
    id: id(p["idProgramacion"]),
    date: p["fecha"],
    startTime: clock(p["horaInicio"]),
    endTime: p["horaFin"] === null ? null : clock(p["horaFin"]),
    isCurrent: flag(p["vigente"]),
    reasonName: nullableText(p["motivo"]),
    registeredByName: nullableText(p["registradoPor"]),
    registeredAt: instant(p["fechaRegistro"])
  }
}
function history(v: unknown): OrderStatusHistorySummary {
  const p = record(v)
  return {
    status: text(p["estado"]),
    statusName: text(p["estadoNombre"]),
    userName: text(p["usuario"]),
    observation: nullableText(p["observacion"]),
    occurredAt: instant(p["fecha"])
  }
}
function order(v: unknown, expected?: number): ServiceOrderSummary {
  const p = record(v),
    orderId = id(p["idOrden"])
  if (expected !== undefined && orderId !== expected) return invalid()
  return {
    id: orderId,
    code: text(p["codigo"]),
    status: text(p["estado"]),
    statusName: text(p["estadoNombre"]),
    requestId: p["idSolicitud"] === null ? null : id(p["idSolicitud"]),
    customerId: id(p["idCliente"]),
    customerName: text(p["cliente"]),
    propertyId: id(p["idPropiedad"]),
    propertyName: text(p["propiedad"]),
    serviceTypeId: id(p["idTipoServicio"]),
    serviceTypeName: text(p["tipoServicio"]),
    estimatedDurationMinutes: id(p["duracionEstimadaMinutos"]),
    estimatedAmount:
      p["montoEstimado"] === null ? null : decimal(p["montoEstimado"], 99999999.99, 0),
    observation: nullableText(p["observacion"]),
    schedule: p["programacion"] === null ? null : schedule(p["programacion"]),
    assignedStaff: unique(list(p["asignados"], assigned), item => item.staffId),
    createdAt: instant(p["fechaCreacion"]),
    updatedAt: p["fechaActualizacion"] === null ? null : instant(p["fechaActualizacion"])
  }
}
function property(v: unknown, owner: ServiceOrderSummary): OrderPropertySummary {
  const p = record(v),
    propertyId = id(p["idPropiedad"]),
    customerId = id(p["idCliente"])
  // Reject crossed ownership before exposing operationally sensitive access fields.
  if (propertyId !== owner.propertyId || customerId !== owner.customerId) return invalid()
  return {
    id: propertyId,
    customerId,
    alias: nullableText(p["alias"]),
    address: text(p["direccion"]),
    city: nullableText(p["ciudad"]),
    region: nullableText(p["estadoRegion"]),
    postalCode: nullableText(p["codigoPostal"]),
    areaSquareMeters: p["areaM2"] === null ? null : decimal(p["areaM2"], 999999.99, 1),
    roomCount: count(p["numeroAmbientes"], 200),
    bathroomCount: count(p["numeroBanos"], 100),
    accessInstructions: nullableText(p["instruccionesAcceso"]),
    doorCode: nullableText(p["codigoPuerta"]),
    hasPets: flag(p["tieneMascotas"]),
    isActive: flag(p["activo"]),
    createdAt: instant(p["fechaCreacion"])
  }
}
export function orderDetail(v: unknown, expected: number): ServiceOrderDetail {
  const p = record(v),
    result = order(p["orden"], expected)
  return {
    order: result,
    property: property(p["propiedad"], result),
    statusHistory: list(p["historial"], history),
    schedules: unique(list(p["programaciones"], schedule), item => item.id)
  }
}
export function orderPagination(query: ServiceOrderQuery) {
  const offset = query.offset === undefined ? 0 : query.offset
  const limit = query.limit === undefined ? 20 : query.limit
  if (
    !integer(offset) ||
    !positiveId(limit) ||
    offset % limit !== 0 ||
    offset / limit > 2147483647 ||
    (query.customerId !== undefined && !positiveId(query.customerId)) ||
    (query.staffId !== undefined && !positiveId(query.staffId)) ||
    (query.status !== undefined && typeof query.status !== "string") ||
    (query.from !== undefined && !calendar(query.from)) ||
    (query.until !== undefined && !calendar(query.until)) ||
    (query.from !== undefined && query.until !== undefined && query.from > query.until)
  )
    throw new OperationsError("INVALID_DATA", "Revisa la consulta de órdenes.")
  const status = query.status?.trim().toUpperCase()
  return {
    pagina: offset / limit,
    tamanio: limit,
    ...(status ? { estado: status } : {}),
    ...(query.customerId !== undefined ? { idCliente: query.customerId } : {}),
    ...(query.staffId !== undefined ? { idPersonal: query.staffId } : {}),
    ...(query.from !== undefined ? { desde: query.from } : {}),
    ...(query.until !== undefined ? { hasta: query.until } : {})
  }
}
export function orderPage(
  v: unknown,
  requested: ReturnType<typeof orderPagination>
): PaginationResponse<ServiceOrderSummary> {
  const p = record(v),
    page = p["pagina"],
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
  const items = unique(
    list(p["contenido"], item => order(item)),
    item => item.id
  )
  if (items.length !== Math.min(size, Math.max(0, total - page * size))) return invalid()
  // Caller-relative customer/staff scope remains backend-owned, never inferred here.
  return { items, total, offset: page * size, limit: size }
}
