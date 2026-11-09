import { describe, expect, it } from "vitest"
import { BillingError, BillingErrorCode } from "./errors/billing.error"
import { IssueInvoiceParams, UpdatePaymentMethodParams } from "./params/billing.params"

const codes: BillingErrorCode[] = [
  "NOT_FOUND",
  "VALIDATION",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "CONFLICT",
  "UNAVAILABLE",
  "INVALID_RESPONSE",
  "UNEXPECTED"
]

describe("billing contracts", () => {
  it.each(codes)("exposes safe typed %s errors", code => {
    const error = new BillingError(code)
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe(code)
    expect(error.name).toBe("BillingError")
    expect(error.message).toBe(`Billing operation failed: ${code}`)
  })
})

// Compile-time contract checks; this spec is included by tsconfig.spec.json.
const issue: IssueInvoiceParams = {
  orderId: 1,
  customerId: 2,
  number: "INV-1",
  dueDate: null,
  lines: [
    {
      serviceTypeId: null,
      additionalServiceId: 3,
      description: "Extra",
      quantity: 1,
      unitPrice: "0.01"
    }
  ]
}
const method: UpdatePaymentMethodParams = { isDefault: true, isActive: false }
// @ts-expect-error Timestamps must be assigned by the backend, not supplied on issue.
const generated: IssueInvoiceParams = { ...issue, issuedAt: new Date() }
// @ts-expect-error Processor tokens are not part of safe metadata updates.
const secret: UpdatePaymentMethodParams = { ...method, tokenReference: "not-a-real-token" }
void [generated, secret]
