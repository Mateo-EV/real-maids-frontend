import { dtoRecord } from "@/app/shared/infrastructure/http/dto-validation"
import { OperationsError } from "../../domain/errors/operations.error"
import { positiveId } from "./service-requests-http.validation"

interface CapturedAssignment {
  staffId: number
  role: "RESPONSABLE" | "APOYO"
}

function invalidData(): never {
  throw new OperationsError("INVALID_DATA", "Revisa los datos del equipo de la orden.")
}

/** Capture only bounded requested primitives; getter failures never escape the call. */
export function captureAssignments(value: unknown): readonly CapturedAssignment[] | null {
  try {
    const params = dtoRecord(value, invalidData)
    const items = params["assignments"]
    if (!Array.isArray(items)) return null
    const length = items.length
    // Bound traversal before reading any entry, including getter-backed entries.
    if (!Number.isInteger(length) || length < 0 || length > 20) return null
    const snapshot: CapturedAssignment[] = []
    const seen = new Set<number>()
    let responsible = 0
    for (let index = 0; index < length; index++) {
      // Do not skip sparse slots or accept inherited entries as a shorter team.
      if (!Object.hasOwn(items, index)) return null
      const item = dtoRecord(items[index], invalidData)
      const staffId = item["staffId"],
        role = item["role"]
      if (!positiveId(staffId) || seen.has(staffId) || (role !== "RESPONSABLE" && role !== "APOYO"))
        return null
      seen.add(staffId)
      if (role === "RESPONSABLE") responsible++
      snapshot.push({ staffId, role })
    }
    return length > 0 && responsible !== 1 ? null : snapshot
  } catch {
    return null
  }
}

export function assignmentsBody(snapshot: readonly CapturedAssignment[] | null) {
  if (snapshot === null) return invalidData()
  // Each explicit subscription receives its own wire body, detached from caller input.
  return {
    asignaciones: snapshot.map(item => ({ idPersonal: item.staffId, rol: item.role }))
  }
}
