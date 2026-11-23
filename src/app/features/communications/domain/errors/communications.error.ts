export type CommunicationsErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "INVALID_INPUT"
  | "INVALID_RESPONSE"
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "CONFLICT"
  | "UNAVAILABLE"
  | "NETWORK"
  | "UNCONFIGURED"
  | "UNEXPECTED"

/** Safe frontend normalization; it never carries backend copy, recipients or message content. */
export class CommunicationsError extends Error {
  constructor(public readonly code: CommunicationsErrorCode) {
    super(`Communications operation failed: ${code}`)
    this.name = "CommunicationsError"
  }
}
