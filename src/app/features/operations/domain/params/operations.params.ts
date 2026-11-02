import { PaginationParams } from "@/app/shared/pagination/pagination.params"

export interface CreateQuoteParams {
  leadId: number | null
  customerId: number | null
  propertyId: number | null
  validUntil: string | null
  lines: CreateQuoteLineParams[]
}
export interface UpdateQuoteParams {
  leadId: number | null
  customerId: number | null
  propertyId: number | null
  validUntil: string | null
}
export interface CreateQuoteLineParams {
  serviceTypeId: number | null
  additionalServiceId: number | null
  description: string | null
  quantity: number
  unitPrice: string
}
export interface UpdateQuoteLineParams {
  serviceTypeId: number | null
  additionalServiceId: number | null
  description: string | null
  quantity: number
  unitPrice: string
}
export interface CreateServiceContractParams {
  customerId: number
  propertyId: number
  serviceTypeId: number
  frequencyId: number
  rateId: number
  preferredDay: string | null
  preferredTime: string | null
  validFrom: string
  validUntil: string | null
  isActive: boolean
}
export interface UpdateServiceContractParams {
  propertyId: number
  serviceTypeId: number
  frequencyId: number
  rateId: number
  preferredDay: string | null
  preferredTime: string | null
  validFrom: string
  validUntil: string | null
  isActive: boolean
}
export interface CreateServiceRequestParams {
  customerId: number
  propertyId: number
  serviceTypeId: number
  description: string | null
  desiredDate: string | null
}
export interface UpdateServiceRequestParams {
  propertyId: number
  serviceTypeId: number
  description: string | null
  desiredDate: string | null
}
export interface CancelServiceRequestParams {
  reason: string
}
export interface CreateServiceOrderParams {
  requestId: number
  estimatedAmount: string | null
  observation: string | null
}
export interface UpdateServiceOrderParams {
  estimatedAmount: string | null
  observation: string | null
}
// Open wire strings: no SQL CHECK constrains status codes or assignment roles.
export interface ChangeOrderStatusParams {
  status: string
  observation: string | null
}
export interface ScheduleServiceOrderParams {
  date: string
  startTime: string
  endTime: string | null
  reasonId: number | null
}
export interface AssignmentItemParams {
  staffId: number
  role: string
}
export interface ReplaceServiceAssignmentsParams {
  assignments: AssignmentItemParams[]
}
export interface CreateOrderStatusParams {
  name: string
  sortOrder: number
  isFinal: boolean
}
export interface UpdateOrderStatusParams {
  name: string
  sortOrder: number
  isFinal: boolean
}
export interface CreateReschedulingReasonParams {
  name: string
  description: string | null
  isActive: boolean
}
export interface UpdateReschedulingReasonParams {
  name: string
  description: string | null
  isActive: boolean
}
export interface ServiceRequestQuery extends PaginationParams {
  customerId?: number
  status?: string
  from?: string
  until?: string
}
export interface ServiceOrderQuery extends PaginationParams {
  status?: string
  customerId?: number
  staffId?: number
  from?: string
  until?: string
}
export interface AgendaQuery {
  from: string
  until: string
  staffId?: number
}
export interface QuoteQuery extends PaginationParams {}
export interface ServiceContractQuery extends PaginationParams {}
