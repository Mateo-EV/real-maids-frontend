export type UserSessionErrorCode =
  | "SESSION_NOT_FOUND"
  | "CURRENT_SESSION"
  | "VALIDATION"
  | "INVALID_QUERY"
  | "INVALID_RESPONSE"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NETWORK"
  | "UNCONFIGURED"
  | "UNEXPECTED"

export class UserSessionError extends Error {
  constructor(public readonly code: UserSessionErrorCode) {
    super(code)
    this.name = "UserSessionError"
  }
}
