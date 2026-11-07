import { DestroyRef } from "@angular/core"
import { Observable } from "rxjs"
import { ServiceOrderSummary } from "../../domain/models/operations-read.models"
import { OperationsErrorCode } from "../../domain/errors/operations.error"

export interface ServiceOrderWriteDialogContext {
  order: ServiceOrderSummary
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  onSaved: () => void
}
export const orderPositiveId = (value: number) =>
  Number.isSafeInteger(value) && value > 0 && value <= 2147483647
export function orderCivilDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split("-").map(Number)
  const days = [
    31,
    y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31
  ]
  return y >= 1 && m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1]
}
export const orderClock = (value: string) =>
  /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,9})?)?$/.test(value)
export function orderWriteError(code: OperationsErrorCode): string {
  switch (code) {
    case "FORBIDDEN":
      return "No tienes permiso para realizar este cambio."
    case "NOT_FOUND":
      return "La orden ya no está disponible. Cierra y vuelve a consultarla."
    case "INVALID_DATA":
      return "Revisa los datos y el estado actual de la orden."
    case "CONFLICT":
      return "La orden o la disponibilidad cambió. Consulta su estado antes de reintentar."
    case "UNAUTHENTICATED":
      return "La sesión no está disponible. Vuelve a iniciar sesión."
    default:
      return "No se pudo confirmar el cambio. Consulta el estado antes de reintentar; la operación pudo haberse procesado."
  }
}
