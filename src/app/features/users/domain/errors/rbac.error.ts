export type RbacErrorCode =
  | "ROLE_NOT_FOUND"
  | "INVALID_GRANTS"
  | "UNEXPECTED"
  | "INVALID_RESPONSE"
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "NETWORK"
  | "UNCONFIGURED"
  | "BUSY"
  | "UNSUPPORTED"
  | "VALIDATION"
export class RbacError extends Error {
  constructor(public readonly code: RbacErrorCode) {
    super(code)
    this.name = "RbacError"
  }
}
