export type ReportsSettingsErrorCode =
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NETWORK"
  | "INVALID_RESPONSE"
  | "UNEXPECTED"
  // Documented-but-unwired operations (CSV export, KPI/settings/migration proposals) are
  // refused without dispatching anything; no endpoint is invented for them.
  | "UNSUPPORTED"

export class ReportsSettingsError extends Error {
  constructor(
    public readonly code: ReportsSettingsErrorCode,
    message = "Reports or settings operation failed"
  ) {
    super(message)
    this.name = "ReportsSettingsError"
  }
}
