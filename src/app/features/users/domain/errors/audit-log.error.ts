export type AuditLogErrorCode = "INVALID_PAGINATION"

export class AuditLogError extends Error {
  constructor(public readonly code: AuditLogErrorCode) {
    super("Invalid audit log pagination")
    this.name = "AuditLogError"
  }
}
