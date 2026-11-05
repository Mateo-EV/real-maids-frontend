import { failure } from "./service-requests-http.validation"

export function cancelRequestBody(reason: unknown): { motivo: string } {
  if (typeof reason !== "string") throw failure("INVALID_DATA")
  const motivo = reason.trim()
  if (motivo.length === 0 || motivo.length > 250) throw failure("INVALID_DATA")
  return { motivo }
}
