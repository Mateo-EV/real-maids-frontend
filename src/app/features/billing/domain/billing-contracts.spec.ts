import { Injector } from "@angular/core"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { BillingError, BillingErrorCode } from "./errors/billing.error"
import { BILLING_REPOSITORY, BillingRepository } from "./repositories/billing.repository"
import {
  IssueInvoiceParams,
  RecordPaymentParams,
  RecordCollectionAdjustmentParams,
  UpdatePaymentMethodParams
} from "./params/billing.params"
import { Invoice } from "./entities/invoice.entity"

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

  it("injects a complete proposed repository with shared pages and Result failures", async () => {
    const invoice = Invoice.create(
      1,
      2,
      3,
      4,
      "INV-1",
      "12.30",
      "0.00",
      "12.30",
      "12.30",
      new Date("2026-03-02T12:00:00Z"),
      null
    )
    const failure = () => of(Result.failure(new BillingError("UNAVAILABLE")))
    const repository: BillingRepository = {
      getPaymentStatuses: failure,
      getPaymentMethods: failure,
      updatePaymentMethod: failure,
      getInvoicesPage: vi.fn(() =>
        of(Result.success({ items: [invoice], total: 31, offset: 20, limit: 10 }))
      ),
      getInvoice: failure,
      getInvoiceLines: failure,
      issueInvoice: failure,
      getPayments: failure,
      recordPayment: vi.fn(failure),
      getCollectionAttempts: failure,
      getCollectionAdjustments: failure,
      recordCollectionAdjustment: failure
    }
    const injector = Injector.create({
      providers: [{ provide: BILLING_REPOSITORY, useValue: repository }]
    })
    const injected = injector.get(BILLING_REPOSITORY)
    expect(injected).toBe(repository)
    const query = { customerId: 3, paymentStatusId: 4, orderId: 2, offset: 20, limit: 10 }
    const page = await firstValueFrom(injected.getInvoicesPage(query))
    expect(repository.getInvoicesPage).toHaveBeenCalledWith(query)
    expect(page).toEqual(Result.success({ items: [invoice], total: 31, offset: 20, limit: 10 }))
    const payment: RecordPaymentParams = {
      paymentMethodId: null,
      amount: "12.30",
      externalReference: null
    }
    expect(await firstValueFrom(injected.recordPayment(1, payment))).toEqual(
      Result.failure(new BillingError("UNAVAILABLE"))
    )
    expect(repository.recordPayment).toHaveBeenCalledWith(1, payment)
    injector.destroy()
  })

  it("keeps proposed action inputs explicit and excludes generated metadata", () => {
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
    const adjustment: RecordCollectionAdjustmentParams = {
      type: "correction",
      amount: "-0.01",
      reason: "Correction"
    }
    expect(issue.lines[0].unitPrice).toBe("0.01")
    expect(method).toEqual({ isDefault: true, isActive: false })
    expect(adjustment.amount).toBe("-0.01")
    // @ts-expect-error Timestamps must be assigned by the backend, not supplied on issue.
    const generated: IssueInvoiceParams = { ...issue, issuedAt: new Date() }
    expect(generated).toHaveProperty("issuedAt")
    // @ts-expect-error Processor tokens are not part of safe metadata updates.
    const secret: UpdatePaymentMethodParams = { tokenReference: "not-a-real-token" }
    expect(secret).not.toHaveProperty("isDefault")
  })
})
