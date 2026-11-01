import { AvailabilitySlotParams } from "../params/field-operations.params"

// PersonalResponse does not expose migration metadata or availability row IDs.
export interface FieldStaffSummary {
  id: number
  name: string
  document: string
  phone: string | null
  email: string | null
  language: string
  joinedOn: string | null
  isActive: boolean
  userId: number | null
  availability: AvailabilitySlotParams[]
  createdAt: Date
}
