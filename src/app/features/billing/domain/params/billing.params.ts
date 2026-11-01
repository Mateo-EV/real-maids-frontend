import { PaginationParams } from "@/app/shared/pagination/pagination.params"

export interface InvoiceQuery extends PaginationParams {
  customerId?: number
  paymentStatusId?: number
  orderId?: number
}

// Proposed inputs: totals, balance, status and audit metadata are backend-owned.
export interface IssueInvoiceLineParams {
  serviceTypeId: number | null
  additionalServiceId: number | null
  description: string
  quantity: number
  unitPrice: string
}

export interface IssueInvoiceParams {
  orderId: number
  customerId: number
  number: string
  dueDate: string | null
  lines: IssueInvoiceLineParams[]
}

export interface UpdatePaymentMethodParams {
  isDefault?: boolean
  isActive?: boolean
}

export interface RecordPaymentParams {
  paymentMethodId: number | null
  amount: string
  externalReference: string | null
}

export interface RecordCollectionAdjustmentParams {
  type: string
  amount: string
  reason: string
}
