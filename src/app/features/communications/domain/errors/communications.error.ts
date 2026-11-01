export type CommunicationsErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "UNEXPECTED"

export class CommunicationsError extends Error {
  constructor(public readonly code: CommunicationsErrorCode) {
    super(`Communications operation failed: ${code}`)
    this.name = "CommunicationsError"
  }
}
