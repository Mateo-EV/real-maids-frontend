export type CustomerSupportErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "UNEXPECTED"

export class CustomerSupportError extends Error {
  constructor(public readonly code: CustomerSupportErrorCode) {
    super(`Customer support operation failed: ${code}`)
    this.name = "CustomerSupportError"
  }
}
