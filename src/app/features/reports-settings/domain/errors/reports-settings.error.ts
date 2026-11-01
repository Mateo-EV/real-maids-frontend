export type ReportsSettingsErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NETWORK"
  | "INVALID_RESPONSE"
  | "UNEXPECTED"

export class ReportsSettingsError extends Error {
  constructor(
    public readonly code: ReportsSettingsErrorCode,
    message = "Reports or settings operation failed"
  ) {
    super(message)
    this.name = "ReportsSettingsError"
  }
}
