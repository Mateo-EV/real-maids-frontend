export type CustomerErrorCode = "CUSTOMER_NOT_FOUND" | "UNEXPECTED"

export class CustomerError extends Error {
  constructor(public readonly code: CustomerErrorCode) {
    super(code === "CUSTOMER_NOT_FOUND" ? "Customer not found" : "Unexpected customer error")
    this.name = "CustomerError"
  }
}
