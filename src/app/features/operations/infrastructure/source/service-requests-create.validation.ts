import { CreateServiceRequestParams } from "../../domain/params/operations.params"
import { failure, positiveId } from "./service-requests-http.validation"

// A calendar value is not a browser-local business day. The backend owns past-date policy.
function calendar(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split("-").map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

export function createRequestBody(params: CreateServiceRequestParams) {
  if (
    !positiveId(params.customerId) ||
    !positiveId(params.propertyId) ||
    !positiveId(params.serviceTypeId) ||
    !(
      params.description === null ||
      (typeof params.description === "string" && params.description.length <= 2000)
    ) ||
    !(params.desiredDate === null || calendar(params.desiredDate))
  )
    throw failure("INVALID_DATA")
  return {
    idCliente: params.customerId,
    idPropiedad: params.propertyId,
    idTipoServicio: params.serviceTypeId,
    descripcion: params.description,
    fechaDeseada: params.desiredDate
  }
}
