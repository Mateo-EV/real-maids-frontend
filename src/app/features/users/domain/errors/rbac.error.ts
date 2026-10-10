export type RbacErrorCode = "ROLE_NOT_FOUND" | "INVALID_GRANTS" | "UNEXPECTED"
export class RbacError extends Error {
  constructor(public readonly code: RbacErrorCode) {
    super(code)
    this.name = "RbacError"
  }
}
