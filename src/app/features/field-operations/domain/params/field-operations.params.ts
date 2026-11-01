import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { EvidenceMoment } from "../entities/service-evidence.entity"

export interface CreateFieldStaffParams {
  name: string
  document: string
  phone: string | null
  email: string | null
  language: string
  joinedOn: string | null
}
export interface UpdateFieldStaffParams {
  name: string
  document: string
  phone: string | null
  email: string | null
  language: string
  joinedOn: string | null
}
export interface LinkStaffAccountParams {
  userId: number | null
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
