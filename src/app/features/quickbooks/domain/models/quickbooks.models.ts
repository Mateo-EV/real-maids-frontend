/** English projections of IntegracionDtos; none contain OAuth credentials. */
export interface QuickbooksStatus {
  isConfigured: boolean
  isConnected: boolean
  environment: string
  realmId: string | null
  companyName: string | null
  connectionStatus: string
  authorizedByName: string | null
  accessExpiresAt: Date | null
  authorizationExpiresAt: Date | null
  lastConnectedAt: Date | null
  lastSynchronizedAt: Date | null
}

/** Untrusted data: a future adapter must validate allowed HTTPS destinations before navigation. */
export interface QuickbooksAuthorization {
  authorizationUrl: string
}

/** No connection ID, direction, sync_token or generated timestamps are returned by this DTO. */
export interface SynchronizationSummary {
  id: string
  localEntity: string
  localId: string
  quickbooksEntity: string
  externalId: string | null
  status: string
  attemptCount: number
  lastSynchronizedAt: Date | null
  lastErrorSummary: string | null
}

/** Server-sanitized summaries only; not arbitrary request/response payloads. */
export interface IntegrationEventSummary {
  id: string
  eventType: string
  entity: string | null
  localId: string | null
  externalId: string | null
  httpMethod: string | null
  endpoint: string | null
  httpStatus: number | null
  requestId: string | null
  result: string
  errorSummary: string | null
  payloadSummary: string | null
  occurredAt: Date
}

export interface QuickbooksInvoiceLine {
  description: string
  quantity: number
  unitPrice: string
  subtotal: string
}

export interface QuickbooksInvoicePayment {
  id: number
  amount: string
  externalReference: string | null
  paidAt: Date
}

/** Read projection of FacturaResponse, not another billing aggregate. */
export interface QuickbooksInvoice {
  receiptId: number
  number: string
  orderId: number
  orderCode: string
  customerId: number
  customerName: string
  paymentStatus: string
  subtotal: string
  tax: string
  total: string
  outstandingBalance: string
  issuedAt: Date
  dueDate: string | null
  lines: QuickbooksInvoiceLine[]
  payments: QuickbooksInvoicePayment[]
  synchronization: SynchronizationSummary | null
}
