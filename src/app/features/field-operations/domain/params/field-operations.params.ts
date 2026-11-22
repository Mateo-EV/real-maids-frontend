import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { EvidenceMoment } from "../entities/service-evidence.entity"
import { StaffAbsenceDecision, StaffAbsenceStatus } from "../models/staff-absence"

/**
 * Access account intent shared by the employee create/update writes. The tri-state is load-bearing
 * and must never collapse: `createAccount` **absent** leaves the account untouched, `true` creates
 * it or reactivates the retained (deactivated) row — both require `password` and the staff email —
 * and `false` retires an active account. `password` only travels with `true` and its bytes are never
 * trimmed; `PUT /api/personal/{id}/cuenta` is not part of this model.
 */
export interface StaffAccountRequest {
  readonly createAccount?: boolean
  readonly password?: string | null
}

// PersonalRequest fields only: identity, availability and the account intent are separate.
export interface CreateFieldStaffParams extends StaffAccountRequest {
  name: string
  document: string
  phone: string | null
  email: string | null
  language: string
  joinedOn: string | null
}
export interface UpdateFieldStaffParams extends StaffAccountRequest {
  name: string
  document: string
  phone: string | null
  email: string | null
  language: string
  joinedOn: string | null
}
export interface SetFieldStaffStatusParams {
  isActive: boolean
}
export interface AvailabilitySlotParams {
  weekday: string
  startTime: string
  endTime: string
}
export interface ReplaceStaffAvailabilityParams {
  slots: AvailabilitySlotParams[]
}
export interface CreateCrewParams {
  name: string
  description: string | null
  isActive: boolean
}
export interface UpdateCrewParams {
  name: string
  description: string | null
  isActive: boolean
}
export interface CreateCrewMemberParams {
  staffId: number
  role: string
  isActive: boolean
}
export interface UpdateCrewMemberParams {
  role: string
  isActive: boolean
}
// Execution times are business input, not generated identity metadata.
export interface CreateWorkLogParams {
  staffId: number
  startedAt: Date
  endedAt: Date | null
  observation: string | null
}
export interface UpdateWorkLogParams {
  startedAt: Date
  endedAt: Date | null
  observation: string | null
}
export interface CreateServiceChecklistParams {
  taskId: number
}
export interface UpdateServiceChecklistParams {
  isCompleted: boolean
  comment: string | null
}
export interface CreateServiceEvidenceParams {
  staffId: number | null
  fileUrl: string
  moment: EvidenceMoment
  description: string | null
}
export interface UpdateServiceEvidenceParams {
  moment: EvidenceMoment
  description: string | null
}
export interface FieldStaffQuery extends PaginationParams {
  search?: string
  isActive?: boolean
}
export interface CrewQuery extends PaginationParams {}

/**
 * Documented `GET /api/ausencias` filters, plus shared paging. `status` is the closed enum, `staffId`
 * is `idPersonal` and the range is inclusive calendar days (`desde`/`hasta`), never a clock.
 */
export interface StaffAbsenceQuery extends PaginationParams {
  status?: StaffAbsenceStatus
  staffId?: number
  from?: string
  until?: string
}

/** Own request: the inclusive day range and the mandatory reason text, nothing else. */
export interface CreateStaffAbsenceParams {
  startDate: string
  endDate: string
  reason: string
}

/** The documented resolution write; the observation is optional and travels as `null` when blank. */
export interface SetStaffAbsenceStatusParams {
  status: StaffAbsenceDecision
  observation: string | null
}
