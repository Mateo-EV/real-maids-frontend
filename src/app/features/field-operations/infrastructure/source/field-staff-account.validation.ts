import { FieldStaffSummary } from "../../domain/models/field-staff-summary"
import { LinkStaffAccountParams } from "../../domain/params/field-operations.params"
import { failure, positiveId, staffDto } from "./field-staff-http.validation"

/**
 * Wire body of `PUT /api/personal/{id}/cuenta`: the only documented member is `idUsuario`, and
 * `null` unlinks. Nothing else travels — no customer, actor, password or inferred identity.
 */
export interface StaffAccountBody {
  readonly idUsuario: number | null
}

/**
 * Call-time snapshot of the caller's account choice. A getter, a mutated argument or an unknown
 * shape cannot change what was captured, and an unusable number is refused before any dispatch.
 */
export function staffAccountParams(params: LinkStaffAccountParams): StaffAccountBody {
  const userId = params?.userId
  if (userId === null) return { idUsuario: null }
  if (!positiveId(userId)) throw failure("INVALID_DATA")
  return { idUsuario: userId }
}

/** The link write is addressed by the staff record it modifies, so the target is validated too. */
export function staffAccountTarget(id: unknown): number {
  if (!positiveId(id)) throw failure("INVALID_DATA")
  return id
}

/** `PersonalResponse` is the same body the detail read decodes; never a wrapper or an echo. */
export function staffAccountDto(value: unknown, id: number): FieldStaffSummary {
  return staffDto(value, id)
}
