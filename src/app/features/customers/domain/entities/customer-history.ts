import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Customer } from "./customer.entity"

/** Actual RF12 response projections, not SQL entities or a combined activity feed. */
export interface CustomerHistory {
  readonly customer: Customer
  readonly requests: PaginationResponse<CustomerRequestHistory>
  readonly orders: PaginationResponse<CustomerOrderHistory>
  readonly support: PaginationResponse<CustomerSupportHistory>
}
export interface CustomerRequestHistory {
  readonly id: number
  readonly customerId: number
  readonly customer: string
  readonly propertyId: number
  readonly property: string
  readonly serviceTypeId: number
  readonly serviceType: string
  readonly description: string | null
  readonly desiredDate: string | null
  readonly status: string
  readonly registeredBy: string | null
  readonly registeredAt: Date
  readonly updatedAt: Date | null
}
export interface CustomerOrderHistory {
  readonly id: number
  readonly code: string
  readonly status: string
  readonly statusName: string
  readonly requestId: number | null
  readonly customerId: number
  readonly customer: string
  readonly propertyId: number
  readonly property: string
  readonly serviceTypeId: number | null
  readonly serviceType: string | null
  readonly estimatedMinutes: number | null
  readonly estimatedAmount: string | null
  readonly observation: string | null
  readonly schedule: CustomerHistorySchedule | null
  readonly assignees: readonly CustomerHistoryAssignee[]
  readonly createdAt: Date
  readonly updatedAt: Date | null
}
export interface CustomerHistorySchedule {
  readonly id: number
  readonly date: string
  readonly startTime: string
  readonly endTime: string
  readonly isCurrent: boolean
  readonly reason: string | null
  readonly registeredBy: string | null
  readonly registeredAt: Date
}
export interface CustomerHistoryAssignee {
  readonly id: number
  readonly name: string
  readonly phone: string | null
  readonly role: string
}
export interface CustomerSupportHistory {
  readonly id: number
  readonly customerId: number
  readonly customer: string
  readonly orderId: number | null
  readonly orderCode: string | null
  readonly typeId: number
  readonly type: string
  readonly requiresResponse: boolean
  readonly status: string
  readonly statusName: string
  readonly subject: string
  readonly description: string
  readonly registeredAt: Date
  readonly closedAt: Date | null
}
