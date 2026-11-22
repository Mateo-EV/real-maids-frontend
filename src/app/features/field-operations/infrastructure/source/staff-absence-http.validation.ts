import { dtoRecord } from "@/app/shared/infrastructure/http/dto-validation"
import {
  StaffAbsence,
  staffAbsenceDecisions,
  staffAbsenceMaxObservation,
  staffAbsenceMaxReason,
  staffAbsenceStatuses,
  StaffAbsenceDecision,
  StaffAbsenceStatus
} from "../../domain/models/staff-absence"
import {
  CreateStaffAbsenceParams,
  SetStaffAbsenceStatusParams,
  StaffAbsenceQuery
} from "../../domain/params/field-operations.params"
import { failure, positiveId } from "./field-staff-http.validation"

/**
 * Wire validation of the documented absence contract (`/api/ausencias`).
 *
 * The response is `{idAusencia,idPersonal,nombrePersonal,fechaInicio,fechaFin,dias,motivo,estado,
 * observacionResolucion,fechaRegistro,fechaResolucion}`. The two dates are inclusive calendar days,
 * `dias` and both resolution fields are the server's own values, `motivo` is mandatory and `estado`
 * is the closed enum. Nothing is recomputed here: no day arithmetic, no status inference, no
 * timezone shift and no invented catalog.
 */
const record = (value: unknown) => dtoRecord(value, invalid)
export function invalid(): never {
  throw failure("INVALID_RESPONSE")
}
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0
const readId = (value: unknown) => (positiveId(value) ? value : invalid())

/** A real calendar day as text, exactly as the backend documents it (response-side refusal). */
export function calendar(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid()
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1] ? value : invalid()
}
/** Request-side day: a caller's input is bad data, never an invalid response. */
function requestDay(value: unknown): string {
  try {
    return calendar(value)
  } catch {
    throw failure("INVALID_DATA")
  }
}
function instant(value: unknown): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return invalid()
  calendar(value.slice(0, 10))
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : invalid()
}
const status = (value: unknown): StaffAbsenceStatus =>
  typeof value === "string" && staffAbsenceStatuses.includes(value as StaffAbsenceStatus)
    ? (value as StaffAbsenceStatus)
    : invalid()
const decision = (value: unknown): StaffAbsenceDecision => {
  if (typeof value === "string" && staffAbsenceDecisions.includes(value as StaffAbsenceDecision))
    return value as StaffAbsenceDecision
  throw failure("INVALID_DATA")
}
const text = (value: unknown, max?: number) =>
  typeof value === "string" && value.trim().length > 0 && (max === undefined || value.length <= max)
const nullableText = (value: unknown, max: number) =>
  value === null ? null : typeof value === "string" && value.length <= max ? value : invalid()

export function absenceDto(value: unknown, expectedId?: number): StaffAbsence {
  const payload = record(value)
  const id = readId(payload["idAusencia"])
  const startDate = calendar(payload["fechaInicio"])
  const endDate = calendar(payload["fechaFin"])
  if (startDate > endDate) return invalid()
  const days = payload["dias"]
  if (
    typeof days !== "number" ||
    !Number.isSafeInteger(days) ||
    days < 1 ||
    (expectedId !== undefined && id !== expectedId) ||
    !text(payload["nombrePersonal"], 150) ||
    !text(payload["motivo"], staffAbsenceMaxReason)
  )
    return invalid()
  return {
    id,
    staffId: readId(payload["idPersonal"]),
    staffName: payload["nombrePersonal"] as string,
    startDate,
    endDate,
    days,
    reason: payload["motivo"] as string,
    status: status(payload["estado"]),
    resolutionObservation: nullableText(
      payload["observacionResolucion"],
      staffAbsenceMaxObservation
    ),
    registeredAt: instant(payload["fechaRegistro"]),
    resolvedAt: payload["fechaResolucion"] === null ? null : instant(payload["fechaResolucion"])
  }
}

export function absencePagination(query: StaffAbsenceQuery) {
  const offset = query.offset ?? 0,
    limit = query.limit ?? 20
  if (
    !integer(offset) ||
    !integer(limit) ||
    limit < 1 ||
    offset % limit !== 0 ||
    offset / limit > 2147483647 ||
    (query.status !== undefined &&
      !staffAbsenceStatuses.includes(String(query.status) as StaffAbsenceStatus)) ||
    (query.staffId !== undefined && !positiveId(query.staffId)) ||
    (query.from !== undefined && requestDay(query.from) !== query.from) ||
    (query.until !== undefined && requestDay(query.until) !== query.until) ||
    (query.from !== undefined && query.until !== undefined && query.from > query.until)
  )
    throw failure("INVALID_DATA")
  return {
    pagina: offset / limit,
    tamanio: limit,
    ...(query.status !== undefined ? { estado: query.status } : {}),
    ...(query.staffId !== undefined ? { idPersonal: query.staffId } : {}),
    ...(query.from !== undefined ? { desde: query.from } : {}),
    ...(query.until !== undefined ? { hasta: query.until } : {})
  }
}

export function absencePage(value: unknown, requested: ReturnType<typeof absencePagination>) {
  const payload = record(value),
    page = payload["pagina"],
    size = payload["tamanio"],
    total = payload["totalElementos"]
  if (
    !integer(page) ||
    page !== requested.pagina ||
    !integer(size) ||
    size < 1 ||
    size > Math.min(100, requested.tamanio) ||
    !integer(total) ||
    !Number.isSafeInteger(page * size) ||
    payload["totalPaginas"] !== Math.ceil(total / size) ||
    !Array.isArray(payload["contenido"])
  )
    return invalid()
  const items = payload["contenido"].map(value => absenceDto(value))
  if (
    new Set(items.map(item => item.id)).size !== items.length ||
    items.length !== Math.min(size, Math.max(0, total - page * size))
  )
    return invalid()
  return { items, total, offset: page * size, limit: size }
}

/**
 * The own request body: `fechaInicio`/`fechaFin` are inclusive calendar days and `motivo` is the
 * mandatory text, transported trimmed and bounded by the documented `@Size(max = 500)`. A reversed
 * range, an impossible day, a blank reason or an over-long one is refused before any dispatch.
 */
export function absenceCreateBody(params: CreateStaffAbsenceParams) {
  const startDate = requestDay(params?.startDate)
  const endDate = requestDay(params?.endDate)
  const reason = typeof params?.reason === "string" ? params.reason.trim() : ""
  if (startDate > endDate || reason.length === 0 || reason.length > staffAbsenceMaxReason)
    throw failure("INVALID_DATA")
  return { fechaInicio: startDate, fechaFin: endDate, motivo: reason }
}

/**
 * The resolution body; a blank observation is `null`, never an empty string, and its text is bounded
 * by the documented `@Size(max = 250)` of `observacion`.
 */
export function absenceStatusBody(id: number, params: SetStaffAbsenceStatusParams) {
  if (!positiveId(id)) throw failure("INVALID_DATA")
  const observation =
    typeof params?.observation === "string" ? params.observation.trim() : params?.observation
  if (observation !== null && observation !== undefined && typeof observation !== "string")
    throw failure("INVALID_DATA")
  if (typeof observation === "string" && observation.length > staffAbsenceMaxObservation)
    throw failure("INVALID_DATA")
  return {
    target: id,
    body: {
      estado: decision(params?.status),
      observacion: observation ? observation : null
    }
  }
}
