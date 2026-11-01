export type BillingErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "UNEXPECTED"

export class BillingError extends Error {
  constructor(public readonly code: BillingErrorCode) {
    super(`Billing operation failed: ${code}`)
    this.name = "BillingError"
  }
}
