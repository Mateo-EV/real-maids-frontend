import { describe, expect, it } from "vitest"
import { SupportRequestType } from "./entities/support-request-type.entity"
import { SupportStatus } from "./entities/support-status.entity"
import { SupportRequest } from "./entities/support-request.entity"
import { SupportFollowUp } from "./entities/support-follow-up.entity"
import { SatisfactionSurvey } from "./entities/satisfaction-survey.entity"

const date = new Date("2026-03-02T12:34:56Z")

describe("customer support schema factories", () => {
  it("preserves type and state catalog fields without closing catalog names", () => {
    expect({ ...SupportRequestType.create(1, "Future type", false, true) }).toEqual({
      id: 1,
      name: "Future type",
      requiresResponse: false,
      isActive: true
    })
    expect({ ...SupportStatus.create(2, "Future state", 3, true) }).toEqual({
      id: 2,
      name: "Future state",
      order: 3,
      isFinal: true
    })
  })

  it("preserves every request field including nullable order and closure", () => {
    const closed = new Date("2026-03-03T01:02:03Z")
    expect({
      ...SupportRequest.create(1, 2, 3, 4, 5, "Subject", "Description", date, closed)
    }).toEqual({
      id: 1,
      customerId: 2,
      orderId: 3,
      requestTypeId: 4,
      statusId: 5,
      subject: "Subject",
      description: "Description",
      registeredAt: date,
      closedAt: closed
    })
    const open = SupportRequest.create(1, 2, null, 4, 5, "Subject", "Description", date, null)
    expect({ ...open }).toEqual({
      id: 1,
      customerId: 2,
      orderId: null,
      requestTypeId: 4,
      statusId: 5,
      subject: "Subject",
      description: "Description",
      registeredAt: date,
      closedAt: null
    })
    expect(open.registeredAt).toBe(date)
  })

  it("preserves the full schema follow-up, separate from redacted API views", () => {
    expect({ ...SupportFollowUp.create(1, 2, 3, "Message", date) }).toEqual({
      id: 1,
      requestId: 2,
      userId: 3,
      message: "Message",
      createdAt: date
    })
  })

  it("preserves survey fields, nullable comments and CHECK-bound rating edges", () => {
    expect({ ...SatisfactionSurvey.create(1, 2, 3, 5, "Excellent", date) }).toEqual({
      id: 1,
      orderId: 2,
      customerId: 3,
      rating: 5,
      comment: "Excellent",
      createdAt: date
    })
    expect({ ...SatisfactionSurvey.create(1, 2, 3, 1, null, date) }).toEqual({
      id: 1,
      orderId: 2,
      customerId: 3,
      rating: 1,
      comment: null,
      createdAt: date
    })
  })
})
