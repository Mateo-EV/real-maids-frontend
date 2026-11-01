export type FieldOperationsErrorCode =
  "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID_DATA" | "UNAVAILABLE" | "UNKNOWN"

export class FieldOperationsError extends Error {
  constructor(
    public readonly code: FieldOperationsErrorCode,
    message: string
  ) {
    super(message)
    this.name = "FieldOperationsError"
  }
}
