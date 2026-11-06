import { dtoRecord, dtoText } from "@/app/shared/infrastructure/http/dto-validation"
import { OperationsError } from "../../domain/errors/operations.error"
import { ReschedulingReasonSummary } from "../../domain/models/operations-read.models"
import { positiveId } from "./service-requests-http.validation"

function invalidData(): never {
  throw new OperationsError("INVALID_DATA", "Revisa los datos de programación.")
}
function invalidResponse(): never {
  throw new OperationsError("INVALID_RESPONSE", "La respuesta de motivos no es válida.")
}
function calendar(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}
function clock(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/.test(value)
  )
}

export function scheduleOrderBody(value: unknown) {
  const p = dtoRecord(value, invalidData)
  const date = p["date"],
    startTime = p["startTime"],
    endTime = p["endTime"],
    reasonId = p["reasonId"]
  if (
    !calendar(date) ||
    !clock(startTime) ||
    (endTime !== null && !clock(endTime)) ||
    (reasonId !== null && !positiveId(reasonId))
  )
    return invalidData()
  // Calendar/clock syntax only; business-time and rescheduling rules belong to the backend.
  return { fecha: date, horaInicio: startTime, horaFin: endTime, idMotivo: reasonId }
}

export function activeReschedulingReasons(value: unknown): ReschedulingReasonSummary[] {
  if (!Array.isArray(value)) return invalidResponse()
  const seen = new Set<number>()
  return value.map(item => {
    const p = dtoRecord(item, invalidResponse)
    const id = p["idMotivo"],
      name = p["nombre"],
      description = p["descripcion"]
    if (
      !positiveId(id) ||
      seen.has(id) ||
      !dtoText(name) ||
      (description !== null && typeof description !== "string")
    )
      return invalidResponse()
    seen.add(id)
    return { id, name, description }
  })
}
