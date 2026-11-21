import { dtoRecord } from "@/app/shared/infrastructure/http/dto-validation"
import { OperationsError } from "../../domain/errors/operations.error"
import { ServiceOrderDetail } from "../../domain/models/operations-read.models"
import { orderDetail } from "./service-orders-http.validation"

// Closed wire set from the documented backend enum: no client transition table.
const statuses = ["PENDIENTE", "PROGRAMADA", "EN_PROCESO", "COMPLETADA", "PAGADO", "CANCELADA"]
const maxObservation = 250

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
