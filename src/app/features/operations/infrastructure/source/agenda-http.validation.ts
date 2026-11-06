import { dtoRecord, dtoText } from "@/app/shared/infrastructure/http/dto-validation"
import { OperationsError } from "../../domain/errors/operations.error"
import { AgendaEntry, AssignedStaffSummary } from "../../domain/models/operations-read.models"

function invalidResponse(): never {
  throw new OperationsError("INVALID_RESPONSE", "La respuesta de agenda no es válida.")
}
function invalidQuery(): never {
  throw new OperationsError("INVALID_DATA", "La consulta de agenda no es válida.")
}
const record = (value: unknown) => dtoRecord(value, invalidResponse)
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= 2147483647
const readId = (value: unknown) => (positiveId(value) ? value : invalidResponse())
const text = (value: unknown) => (dtoText(value) ? value : invalidResponse())
const nullableText = (value: unknown) =>
  value === null || typeof value === "string" ? value : invalidResponse()

function calendar(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

// UTC is only a civil-day arithmetic device, not a selected business timezone.
function civilDay(value: string): number {
  const [year, month, day] = value.split("-").map(Number)
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getTime() / 86400000
}

const clock = (value: unknown): value is string =>
  typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/.test(value)

export function agendaParams(snapshot: unknown): {
  desde: string
  hasta: string
  idPersonal?: number
} {
  const query = dtoRecord(snapshot, invalidQuery)
  const from = query["from"],
    until = query["until"],
    staffId = query["staffId"]
  if (
    !calendar(from) ||
    !calendar(until) ||
    from > until ||
    civilDay(until) - civilDay(from) >= 62 ||
    (staffId !== undefined && !positiveId(staffId))
  )
    return invalidQuery()
  return { desde: from, hasta: until, ...(staffId !== undefined ? { idPersonal: staffId } : {}) }
}

function assignedStaff(value: unknown): AssignedStaffSummary[] {
  if (!Array.isArray(value)) return invalidResponse()
  const ids = new Set<number>()
  return value.map(item => {
    const staff = record(item)
    const staffId = readId(staff["idPersonal"])
    if (ids.has(staffId)) return invalidResponse()
    ids.add(staffId)
    return {
      staffId,
      name: text(staff["nombre"]),
      phone: nullableText(staff["telefono"]),
      role: text(staff["rol"])
    }
  })
}

function agendaEntry(value: unknown): AgendaEntry {
  const row = record(value)
  const date = row["fecha"],
    startTime = row["horaInicio"],
    endTime = row["horaFin"]
  if (!calendar(date) || !clock(startTime) || (endTime !== null && !clock(endTime)))
    return invalidResponse()
  return {
    date,
    startTime,
    endTime,
    orderId: readId(row["idOrden"]),
    code: text(row["codigo"]),
    status: text(row["estado"]),
    customerName: text(row["cliente"]),
    propertyName: text(row["propiedad"]),
    serviceTypeName: nullableText(row["tipoServicio"]),
    assignedStaff: assignedStaff(row["asignados"])
  }
}

export function agendaEntries(value: unknown): AgendaEntry[] {
  try {
    if (!Array.isArray(value)) return invalidResponse()
    return value.map(item => agendaEntry(item))
  } catch {
    return invalidResponse()
  }
}
