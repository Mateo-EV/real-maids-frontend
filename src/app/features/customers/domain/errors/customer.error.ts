export type CustomerErrorCode =
  | "CUSTOMER_NOT_FOUND"
  | "PROPERTY_NOT_FOUND"
  | "LEAD_NOT_FOUND"
  | "INVALID_INPUT"
  | "CONFLICT"
  | "EMAIL_RESERVED"
  | "CUSTOMER_NAME_INVALID"
  | "CUSTOMER_PHONE_INVALID"
  | "ACCOUNT_EMAIL_REQUIRED"
  | "ACCOUNT_PASSWORD_REQUIRED"
  | "ACCOUNT_PASSWORD_WITHOUT_ACCOUNT"
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
  LEAD_NOT_FOUND: "Lead not found",
  INVALID_INPUT: "Invalid customer input",
  CONFLICT: "Customer data conflict",
  EMAIL_RESERVED: "Customer email is already reserved",
  CUSTOMER_NAME_INVALID: "Customer name was rejected by the service",
  CUSTOMER_PHONE_INVALID: "Customer phone was rejected by the service",
  ACCOUNT_EMAIL_REQUIRED: "A portal account requires the customer email",
  ACCOUNT_PASSWORD_REQUIRED: "A portal account requires an initial password",
  ACCOUNT_PASSWORD_WITHOUT_ACCOUNT: "A password is only accepted together with a requested account",
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
