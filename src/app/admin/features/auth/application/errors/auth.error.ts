export type AuthErrorCode = "INVALID_CREDENTIALS" | "UNEXPECTED"

export class AuthError extends Error {
  constructor(public readonly code: AuthErrorCode) {
    super(
      code === "INVALID_CREDENTIALS" ? "Invalid credentials" : "Unexpected authentication error"
    )
    this.name = "AuthError"
  }
}
