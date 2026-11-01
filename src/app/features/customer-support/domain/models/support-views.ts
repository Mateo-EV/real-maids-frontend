// English projections of AtencionDtos, not substitutes for complete SQL entities.
// State codes remain open strings (SQL has no CHECK); the current API documents
// RECIBIDA, EN_REVISION, RESUELTA and CERRADA. Authorization stays on the backend.
export interface SupportRequestView {
  id: number
  customerId: number
  customerName: string
  orderId: number | null
  orderCode: string | null
  requestTypeId: number
  requestTypeName: string
  requiresResponse: boolean
  state: string
  stateName: string
  subject: string
  description: string
  registeredAt: Date
  closedAt: Date | null
}

export interface SupportFollowUpView {
  id: number
  author: string | null
  isFromCustomer: boolean
  message: string
  createdAt: Date
}

export interface SupportDetail {
  request: SupportRequestView
  followUps: SupportFollowUpView[]
}

export interface SupportRequestTypeView {
  id: number
  name: string
  requiresResponse: boolean
}
