export type WebContentErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NETWORK"
  | "INVALID_RESPONSE"
  | "UNEXPECTED"

export class WebContentError extends Error {
  constructor(
    public readonly code: WebContentErrorCode,
    message = "Web content operation failed"
  ) {
    super(message)
    this.name = "WebContentError"
  }
}
