import { dtoRecord } from "@/app/shared/infrastructure/http/dto-validation"
import { OperationsError } from "../../domain/errors/operations.error"
import { ServiceOrderDetail } from "../../domain/models/operations-read.models"
import { orderDetail } from "./service-orders-http.validation"

// Closed wire set from the documented backend enum: no client transition table.
const statuses = ["PENDIENTE", "PROGRAMADA", "EN_PROCESO", "COMPLETADA", "PAGADO", "CANCELADA"]
const maxObservation = 250
/** The documented uniform 400 body carries one business sentence; nothing longer is surfaced. */
const maxRefusalMessage = 300

function invalidData(): never {
  throw new OperationsError("INVALID_DATA", "Revisa los datos del cambio de estado.")
}

export function changeOrderStatusBody(value: unknown) {
  const p = dtoRecord(value, invalidData)
  const status = p["status"],
    observation = p["observation"]
  if (typeof status !== "string" || !statuses.includes(status)) return invalidData()
  if (observation !== null && typeof observation !== "string") return invalidData()
  if (typeof observation === "string" && observation.length > maxObservation) return invalidData()
  // The desired code travels untouched; which transition is legal stays server-owned.
  return {
    estado: status,
    observacion: typeof observation === "string" && observation.trim() ? observation : null
  }
}

export function changedOrderDetail(value: unknown, expected: number): ServiceOrderDetail {
  // Same envelope and nested guards as the detail GET, not a flat DTO or a 204.
  return orderDetail(value, expected)
}

/**
 * Business refusal text of the documented uniform BAD_REQUEST body
 * (`{ codigo, mensaje, errores?, timestamp }`, built by the backend `GlobalExceptionHandler`).
 *
 * Only that one sentence is projected so a caller can explain the refusal: `errores`, `timestamp`
 * and every other field are dropped, and an unknown, non-400, blank, non-text or over-long body
 * yields `null` so the consumer keeps its own safe copy. Internal whitespace and newlines are
 * collapsed because the body is rendered as one plain-text sentence.
 */
export function orderStatusRefusalMessage(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (body["codigo"] !== 400) return null
  const message = body["mensaje"]
  if (typeof message !== "string") return null
  const sentence = message.replace(/\s+/g, " ").trim()
  if (!sentence || sentence.length > maxRefusalMessage) return null
  return sentence
}
