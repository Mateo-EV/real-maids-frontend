export type CustomerErrorCode =
  | "CUSTOMER_NOT_FOUND"
  | "PROPERTY_NOT_FOUND"
  | "PROSPECT_NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "FORBIDDEN"
  | "UNEXPECTED"

const messages: Record<CustomerErrorCode, string> = {
  CUSTOMER_NOT_FOUND: "Customer not found",
  PROPERTY_NOT_FOUND: "Property not found",
  PROSPECT_NOT_FOUND: "Prospect not found",
  INVALID_INPUT: "Invalid customer input",
  CONFLICT: "Customer data conflict",
  FORBIDDEN: "Customer operation forbidden",
  UNEXPECTED: "Unexpected customer error"
}

export class CustomerError extends Error {
  constructor(public readonly code: CustomerErrorCode) {
    super(messages[code])
    this.name = "CustomerError"
  }
}
