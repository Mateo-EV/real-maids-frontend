export type OperationsErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "CONFLICT"
  | "INVALID_DATA"
  | "UNAVAILABLE"
  | "UNKNOWN"
  | "UNCONFIGURED"
  | "UNAUTHENTICATED"
  | "INVALID_RESPONSE"
  | "UNSUPPORTED"

export class OperationsError extends Error {
  constructor(
    public readonly code: OperationsErrorCode,
    message: string
  ) {
    super(message)
    this.name = "OperationsError"
  }
}
