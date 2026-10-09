export type UserSessionErrorCode = "SESSION_NOT_FOUND" | "CURRENT_SESSION" | "UNEXPECTED"

export class UserSessionError extends Error {
  constructor(public readonly code: UserSessionErrorCode) {
    super(code)
    this.name = "UserSessionError"
  }
}
