export type RoleErrorCode =
  | "ROLE_NOT_FOUND"
  | "ROLE_IN_USE"
  | "UNEXPECTED"
  | "INVALID_RESPONSE"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NETWORK"
  | "UNCONFIGURED"
  | "UNSUPPORTED"

export class RoleError extends Error {
  constructor(public readonly code: RoleErrorCode) {
    super(
      code === "ROLE_NOT_FOUND"
        ? "Role not found"
        : code === "ROLE_IN_USE"
          ? "Role is assigned to a user"
          : "Unexpected role error"
    )
    this.name = "RoleError"
  }
}
