// Backend response projections deliberately do not fabricate SQL-only foreign keys or IDs.
export interface ServiceRequestSummary {
  id: number
  customerId: number
  customerName: string
  propertyId: number
  propertyName: string
  serviceTypeId: number
  serviceTypeName: string
  description: string | null
  desiredDate: string | null
  status: string
  registeredByName: string
  registeredAt: Date
  updatedAt: Date | null
}
export interface AssignedStaffSummary {
  staffId: number
  name: string
  phone: string | null
  role: string
}
export interface ScheduleSummary {
  id: number
  date: string
  startTime: string
  endTime: string | null
  isCurrent: boolean
  reasonName: string | null
  registeredByName: string | null
  registeredAt: Date
}
export interface OrderStatusHistorySummary {
  status: string
  statusName: string
  userName: string
  observation: string | null
  occurredAt: Date
}
export interface ServiceOrderSummary {
  id: number
  code: string
  status: string
  statusName: string
  requestId: number | null
  customerId: number
  customerName: string
  propertyId: number
  propertyName: string
  serviceTypeId: number
  serviceTypeName: string
  estimatedDurationMinutes: number
  estimatedAmount: string | null
  observation: string | null
  schedule: ScheduleSummary | null
  assignedStaff: AssignedStaffSummary[]
  createdAt: Date
  updatedAt: Date | null
}
// Operations-owned detail projection avoids importing customer entities into this area.
export interface OrderPropertySummary {
  id: number
  customerId: number
  alias: string | null
  address: string
  city: string | null
  region: string | null
  postalCode: string | null
  areaSquareMeters: string | null
  roomCount: number | null
  bathroomCount: number | null
  accessInstructions: string | null
  doorCode: string | null
  hasPets: boolean
  isActive: boolean
  createdAt: Date
}
export interface ServiceOrderDetail {
  order: ServiceOrderSummary
  property: OrderPropertySummary
  statusHistory: OrderStatusHistorySummary[]
  schedules: ScheduleSummary[]
}
export interface AgendaEntry {
  date: string
  startTime: string
  endTime: string | null
  orderId: number
  code: string
  status: string
  customerName: string
  propertyName: string
  serviceTypeName: string
  assignedStaff: AssignedStaffSummary[]
}
export interface ReschedulingReasonSummary {
  id: number
  name: string
  description: string | null
}
