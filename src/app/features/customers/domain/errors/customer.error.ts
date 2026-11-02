export type CustomerErrorCode =
  | "CUSTOMER_NOT_FOUND"
  | "PROPERTY_NOT_FOUND"
  | "PROSPECT_NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "NETWORK"
  | "UNCONFIGURED"
  | "INVALID_RESPONSE"
  | "NOT_FOUND"
  | "UNEXPECTED"

const messages: Record<CustomerErrorCode, string> = {
  CUSTOMER_NOT_FOUND: "Customer not found",
  PROPERTY_NOT_FOUND: "Property not found",
  PROSPECT_NOT_FOUND: "Prospect not found",
  INVALID_INPUT: "Invalid customer input",
  CONFLICT: "Customer data conflict",
  FORBIDDEN: "Customer operation forbidden",
  UNAUTHENTICATED: "Customer operation requires a valid session",
  NETWORK: "Customer service unavailable",
  UNCONFIGURED: "Customer service not configured for this platform",
  INVALID_RESPONSE: "Invalid customer service response",
  NOT_FOUND: "Customer resource not found",
  UNEXPECTED: "Unexpected customer error"
}

export class CustomerError extends Error {
  constructor(public readonly code: CustomerErrorCode) {
    super(messages[code])
    this.name = "CustomerError"
  }
}
