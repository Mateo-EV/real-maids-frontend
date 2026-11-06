import { dtoRecord } from "@/app/shared/infrastructure/http/dto-validation"
import { OperationsError } from "../../domain/errors/operations.error"
import { positiveId } from "./service-requests-http.validation"
import { orderDetail } from "./service-orders-http.validation"

const badData = (): never => {
  throw new OperationsError("INVALID_DATA", "Revisa los datos de la orden.")
}
const badResponse = (): never => {
  throw new OperationsError("INVALID_RESPONSE", "La creación no se pudo confirmar.")
}

export function createOrderBody(value: unknown) {
  const p = dtoRecord(value, badData)
  const requestId = p["requestId"],
    amount = p["estimatedAmount"],
    observation = p["observation"]
  if (
    !positiveId(requestId) ||
    !(observation === null || (typeof observation === "string" && observation.length <= 2000))
  )
    return badData()
  let wireAmount: number | null = null
  if (amount !== null) {
    if (typeof amount !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(amount)) return badData()
    wireAmount = Number(amount)
    if (!Number.isFinite(wireAmount) || wireAmount < 0 || wireAmount > 99999999.99) return badData()
  }
  return { idSolicitud: requestId, montoEstimado: wireAmount, observacion: observation }
}

export function createdOrderDetail(value: unknown, requestId: number) {
  const envelope = dtoRecord(value, badResponse)
  const header = dtoRecord(envelope["orden"], badResponse)
  const orderId = header["idOrden"]
  if (
    !positiveId(orderId) ||
    header["idSolicitud"] !== requestId ||
    header["estado"] !== "PENDIENTE"
  )
    return badResponse()
  // Reuse all existing nested DTO and property/customer guards without relaxing reads.
  return orderDetail(value, orderId)
}
