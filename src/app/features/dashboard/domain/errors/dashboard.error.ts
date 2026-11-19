export type DashboardErrorCode =
  // An unusable window (malformed or inverted pair) is refused before dispatch.
  | "VALIDATION"
  | "UNAUTHENTICATED"
  // `DASHBOARD_LEER` is the backend's authority; a 403 is never an empty dashboard.
  | "FORBIDDEN"
  | "UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "UNEXPECTED"

export class DashboardError extends Error {
  constructor(public readonly code: DashboardErrorCode) {
    super(`Dashboard read failed: ${code}`)
    this.name = "DashboardError"
  }
}
