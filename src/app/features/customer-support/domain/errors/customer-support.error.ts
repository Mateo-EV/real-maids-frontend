export type CustomerSupportErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "UNEXPECTED"
  // The domain contract proposes operations the backend does not expose yet.
  | "UNSUPPORTED"

export class CustomerSupportError extends Error {
  constructor(public readonly code: CustomerSupportErrorCode) {
    super(`Customer support operation failed: ${code}`)
    this.name = "CustomerSupportError"
  }
}
