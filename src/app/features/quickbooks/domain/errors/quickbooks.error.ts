export type QuickbooksErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NETWORK"
  | "UNCONFIGURED"
  | "INTEGRATION_REJECTED"
  | "INVALID_RESPONSE"
  | "UNEXPECTED"

export class QuickbooksError extends Error {
  constructor(
    public readonly code: QuickbooksErrorCode,
    message = "QuickBooks operation failed"
  ) {
    super(message)
    this.name = "QuickbooksError"
  }
}
