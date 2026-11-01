import { describe, expect, it } from "vitest"
import { PaymentMethod } from "./entities/payment-method.entity"
import { PaymentStatus } from "./entities/payment-status.entity"
import { Invoice } from "./entities/invoice.entity"
import { InvoiceLine } from "./entities/invoice-line.entity"
import { Payment } from "./entities/payment.entity"
import { CollectionAttempt } from "./entities/collection-attempt.entity"
import { CollectionAdjustment } from "./entities/collection-adjustment.entity"

const date = new Date("2026-03-02T12:34:56Z")

describe("billing schema factories", () => {
  it("preserves every safe payment-method field, without a processor token", () => {
    const method = PaymentMethod.create(3, 9, "new-method", "0042", true, false, date)
    expect({ ...method }).toEqual({
      id: 3,
      customerId: 9,
      type: "new-method",
      lastDigits: "0042",
      isDefault: true,
      isActive: false,
      registeredAt: date
    })
    expect(PaymentMethod.create(3, 9, "cash", null, false, true, date).lastDigits).toBeNull()
    expect(Object.keys(method)).not.toContain("tokenReference")
  })

  it("preserves extensible payment status metadata", () => {
    expect({ ...PaymentStatus.create(4, "Future status", 8) }).toEqual({
      id: 4,
      name: "Future status",
      order: 8
    })
  })

  it("preserves invoice money verbatim and calendar due dates without timezone conversion", () => {
    const invoice = Invoice.create(
      1,
      2,
      3,
      4,
      "INV-7",
      "99999999.99",
      "0.01",
      "99999999.99",
      "0.00",
      date,
      "2026-03-08"
    )
    expect({ ...invoice }).toEqual({
      id: 1,
      orderId: 2,
      customerId: 3,
      paymentStatusId: 4,
      number: "INV-7",
      subtotal: "99999999.99",
      tax: "0.01",
      total: "99999999.99",
      outstandingBalance: "0.00",
      issuedAt: date,
      dueDate: "2026-03-08"
    })
    expect(invoice.issuedAt).toBe(date)
    expect(
      Invoice.create(1, 2, 3, 4, "INV-7", "0.00", "0.00", "0.00", "0.00", date, null).dueDate
    ).toBeNull()
  })

  it("preserves each line field and nullable service associations", () => {
    expect({ ...InvoiceLine.create(1, 2, 3, 4, "Cleaning", 2, "12.30", "24.60") }).toEqual({
      id: 1,
      invoiceId: 2,
      serviceTypeId: 3,
      additionalServiceId: 4,
      description: "Cleaning",
      quantity: 2,
      unitPrice: "12.30",
      subtotal: "24.60"
    })
    expect({ ...InvoiceLine.create(1, 2, null, null, "Other", 1, "0.00", "0.00") }).toMatchObject({
      serviceTypeId: null,
      additionalServiceId: null
    })
  })

  it("preserves payment precision, dates and all nullable references", () => {
    expect({ ...Payment.create(1, 2, 3, "99999999.99", "external", date, 4) }).toEqual({
      id: 1,
      invoiceId: 2,
      paymentMethodId: 3,
      amount: "99999999.99",
      externalReference: "external",
      paidAt: date,
      registeredByUserId: 4
    })
    expect({ ...Payment.create(1, 2, null, "0.00", null, date, null) }).toEqual({
      id: 1,
      invoiceId: 2,
      paymentMethodId: null,
      amount: "0.00",
      externalReference: null,
      paidAt: date,
      registeredByUserId: null
    })
  })

  it("preserves attempt history without assigning retry behavior", () => {
    expect({ ...CollectionAttempt.create(1, 2, 3, 7, "unknown-result", "Declined", date) }).toEqual(
      {
        id: 1,
        invoiceId: 2,
        paymentMethodId: 3,
        attemptNumber: 7,
        result: "unknown-result",
        rejectionReason: "Declined",
        attemptedAt: date
      }
    )
    expect({ ...CollectionAttempt.create(1, 2, null, 1, "pending", null, date) }).toMatchObject({
      paymentMethodId: null,
      rejectionReason: null
    })
  })

  it("preserves adjustment records without doing financial arithmetic", () => {
    expect({
      ...CollectionAdjustment.create(1, 2, 3, "new-type", "-0.01", "Correction", date)
    }).toEqual({
      id: 1,
      invoiceId: 2,
      userId: 3,
      type: "new-type",
      amount: "-0.01",
      reason: "Correction",
      adjustedAt: date
    })
  })
})
