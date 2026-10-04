export type UserErrorCode = "USER_NOT_FOUND" | "UNEXPECTED" | "EMAIL_ALREADY_EXISTS"

export class UserError extends Error {
  constructor(public readonly code: UserErrorCode) {
    super(
      code === "USER_NOT_FOUND"
        ? "User not found"
        : code === "EMAIL_ALREADY_EXISTS"
          ? "Email already exists"
          : "Unexpected user error"
    )
    this.name = "UserError"
  }
}
