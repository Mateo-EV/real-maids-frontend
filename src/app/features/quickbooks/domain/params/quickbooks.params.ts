import { PaginationParams } from "@/app/shared/pagination/pagination.params"

export interface SynchronizationQuery extends PaginationParams {
  status?: string
  entity?: string
}

export interface IntegrationEventQuery extends PaginationParams {
  result?: string
  type?: string
}

export interface SynchronizeCustomerParams {
  customerId: number
}

export interface QuickbooksOrderParams {
  orderId: number
}

export interface RetrySynchronizationParams {
  synchronizationId: string
}
