export type OperationsErrorCode =
  "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID_DATA" | "UNAVAILABLE" | "UNKNOWN"

export class OperationsError extends Error {
  constructor(
    public readonly code: OperationsErrorCode,
    message: string
  ) {
    super(message)
    this.name = "OperationsError"
  }
}
