/**
 * Staff absences (M06/RF07/HU07/P07; S2–S7, S9, S11) — the closed state set the backend documents.
 * There is no status catalog endpoint, so an unknown code is an invalid response and the frontend
 * never encodes a transition table of its own.
 */
export type StaffAbsenceStatus = "PENDIENTE" | "APROBADA" | "RECHAZADA" | "CANCELADA" | "RETIRADA"

/**
 * Documented bounds of `AusenciaDtos`: `motivo` is `@Size(max = 500)` and the resolution's
 * `observacion` is `@Size(max = 250)`. Both are counted on the trimmed text that actually travels, so
 * padding is never a way to exceed them. UI, store and transport share these constants instead of
 * inventing separate limits.
 */
export const staffAbsenceMaxReason = 500
export const staffAbsenceMaxObservation = 250

/** The only statuses a client may request; `PENDIENTE` is the initial state, never a reset. */
export type StaffAbsenceDecision = "APROBADA" | "RECHAZADA" | "CANCELADA" | "RETIRADA"

export const staffAbsenceStatuses: readonly StaffAbsenceStatus[] = [
  "PENDIENTE",
  "APROBADA",
  "RECHAZADA",
  "CANCELADA",
  "RETIRADA"
]

export const staffAbsenceDecisions: readonly StaffAbsenceDecision[] = [
  "APROBADA",
  "RECHAZADA",
  "CANCELADA",
  "RETIRADA"
]

/**
 * One supplied `AusenciaResponse`. `startDate`/`endDate` are inclusive calendar days (`YYYY-MM-DD`,
 * no clock), `days` and both resolution fields are the server's own values, and `reason` is the text
 * only its owner and HR may read: it never enters a URL, a log or a general audit entry.
 */
export interface StaffAbsence {
  readonly id: number
  readonly staffId: number
  readonly staffName: string
  readonly startDate: string
  readonly endDate: string
  readonly days: number
  readonly reason: string
  readonly status: StaffAbsenceStatus
  readonly resolutionObservation: string | null
  readonly registeredAt: Date
  readonly resolvedAt: Date | null
}

/** Spanish copy of the closed status set; never a translation of a different code. */
export function staffAbsenceStatusName(status: StaffAbsenceStatus): string {
  switch (status) {
    case "PENDIENTE":
      return "Pendiente"
    case "APROBADA":
      return "Aprobada"
    case "RECHAZADA":
      return "Rechazada"
    case "CANCELADA":
      return "Cancelada"
    case "RETIRADA":
      return "Retirada"
  }
}
