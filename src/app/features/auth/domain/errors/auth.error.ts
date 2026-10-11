export type AuthErrorCode =
  | "INVALID_CREDENTIALS"
  | "UNEXPECTED"
  | "NETWORK"
  | "INVALID_RESPONSE"
  | "UNCONFIGURED"
  | "CANCELLED"
  | "INVALID_ACCESS"
  | "INVALID_REFRESH"
  | "INVALID_PROFILE"
  | "STORAGE"
  | "COORDINATION"
  | "FORBIDDEN"

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    // Never include server bodies, credentials or transport details in user-facing errors.
    super(code === "INVALID_CREDENTIALS" ? "Invalid credentials" : "Authentication unavailable")
    this.name = "AuthError"
  }
}
