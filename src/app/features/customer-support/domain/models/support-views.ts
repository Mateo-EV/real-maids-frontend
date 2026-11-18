// English projections of AtencionDtos, not substitutes for complete SQL entities.
// The wire state is the backend's fixed `CodigoEstadoAtencion` enum; there is no
// status catalog endpoint, so the closed set below is the only state vocabulary.
// Authorization stays on the backend.
export const SUPPORT_STATE_CODES = ["RECIBIDA", "EN_REVISION", "RESUELTA", "CERRADA"] as const

export type SupportStateCode = (typeof SUPPORT_STATE_CODES)[number]

export interface SupportRequestView {
  id: number
  customerId: number
  customerName: string
  orderId: number | null
  orderCode: string | null
  requestTypeId: number
  requestTypeName: string
  requiresResponse: boolean
  state: SupportStateCode
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
