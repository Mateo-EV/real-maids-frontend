import { describe, expect, it } from "vitest"
import { CommunicationChannel } from "./entities/communication-channel.entity"
import { MessageTemplate } from "./entities/message-template.entity"
import { SentNotification } from "./entities/sent-notification.entity"
import { NotificationPreference } from "./entities/notification-preference.entity"

const date = new Date("2026-03-02T12:34:56Z")

describe("communications schema factories", () => {
  it("preserves channel metadata", () => {
    expect({ ...CommunicationChannel.create(1, "Future channel", false) }).toEqual({
      id: 1,
      name: "Future channel",
      isActive: false
    })
  })

  it("preserves all template fields including nullable subject and extensible language/event", () => {
    expect({
      ...MessageTemplate.create(1, 2, "custom-event", "fr", "Subject", "Body", false)
    }).toEqual({
      id: 1,
      channelId: 2,
      event: "custom-event",
      language: "fr",
      subject: "Subject",
      body: "Body",
      isActive: false
    })
    expect(MessageTemplate.create(1, 2, "event", "es", null, "Body", true).subject).toBeNull()
  })

  it("preserves BIGINT identity beyond safe numbers, all nullable references and delivery metadata", () => {
    const id = "9223372036854775807"
    const notification = SentNotification.create(
      id,
      2,
      3,
      4,
      "Recipient",
      "future-state",
      "Error",
      date
    )
    expect({ ...notification }).toEqual({
      id,
      templateId: 2,
      userId: 3,
      orderId: 4,
      recipient: "Recipient",
      deliveryStatus: "future-state",
      errorDetail: "Error",
      sentAt: date
    })
    expect(notification.sentAt).toBe(date)
    expect({
      ...SentNotification.create(id, null, null, null, "Recipient", "pending", null, date)
    }).toEqual({
      id,
      templateId: null,
      userId: null,
      orderId: null,
      recipient: "Recipient",
      deliveryStatus: "pending",
      errorDetail: null,
      sentAt: date
    })
  })

  it("preserves every notification preference field without narrowing languages", () => {
    expect({ ...NotificationPreference.create(1, 2, 3, "pt", false) }).toEqual({
      id: 1,
      customerId: 2,
      channelId: 3,
      language: "pt",
      isEnabled: false
    })
  })
})
