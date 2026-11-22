import { FieldOperationsErrorCode } from "../../domain/errors/field-operations.error"

/**
 * Project-owned copy for an absence write refusal. The backend's own text never reaches the UI, and
 * the two documented business refusals get a sentence the user can act on: an overlapping or
 * duplicated request (S11) and the pending service conflicts that block an approval (S5).
 */
export function staffAbsenceWriteError(code: FieldOperationsErrorCode): string {
  switch (code) {
    case "INVALID_DATA":
      return "El servidor rechazó la solicitud. Revisa el rango de días, los solapamientos o los servicios en conflicto antes de reintentar."
    case "CONFLICT":
      return "La ausencia entra en conflicto con otra solicitud o con servicios ya asignados. Revisa los datos antes de reintentar."
    case "FORBIDDEN":
      return "No tienes permiso para realizar esta operación sobre la ausencia."
    case "NOT_FOUND":
      return "La ausencia ya no está disponible. Cierra y actualiza la lista."
    case "UNAUTHENTICATED":
      return "La sesión no está disponible. Vuelve a iniciar sesión."
    case "UNCONFIGURED":
      return "El servicio de ausencias no está disponible en este entorno."
    case "UNAVAILABLE":
      return "No se pudo conectar. Puedes reintentar."
    default:
      return "No se pudo confirmar la operación. Revisa la ausencia antes de reintentar; pudo haberse procesado."
  }
}
