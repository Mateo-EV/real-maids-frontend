import { describe, expect, it } from "vitest"
import { CommunicationChannel } from "./entities/communication-channel.entity"
import { MessageTemplate } from "./entities/message-template.entity"
import { SentNotification } from "./entities/sent-notification.entity"
import { NotificationPreference } from "./entities/notification-preference.entity"
import { CrmNote } from "./entities/crm-note.entity"
import { CrmEmail } from "./entities/crm-email.entity"
import { EmailTemplate } from "./entities/email-template.entity"

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

describe("CRM note and email factories", () => {
  it("keeps exactly one recorded owner and the supplied content, author and instants", () => {
    const note = CrmNote.create(4, 7, null, "Contenido literal", 12, "Autora", date, null)
    expect({ ...note }).toEqual({
      id: 4,
      customerId: 7,
      leadId: null,
      content: "Contenido literal",
      authorId: 12,
      author: "Autora",
      registeredAt: date,
      editedAt: null
    })
    expect(note.registeredAt).toBe(date)
    expect({ ...CrmNote.create(5, null, 9, "Prospecto", 12, "Autora", date, date) }).toMatchObject({
      id: 5,
      customerId: null,
      leadId: 9,
      editedAt: date
    })
  })

  it("preserves the delivered email record without deriving the recipient", () => {
    expect({
      ...CrmEmail.create(
        8,
        7,
        null,
        3,
        "cliente@example.test",
        "Asunto",
        "Cuerpo",
        "ENVIADO",
        null,
        12,
        "Autora",
        date
      )
    }).toEqual({
      id: 8,
      customerId: 7,
      leadId: null,
      templateId: 3,
      recipient: "cliente@example.test",
      subject: "Asunto",
      body: "Cuerpo",
      status: "ENVIADO",
      errorDetail: null,
      authorId: 12,
      author: "Autora",
      sentAt: date
    })
    expect(
      CrmEmail.create(
        9,
        null,
        9,
        null,
        "lead@example.test",
        "S",
        "B",
        "FALLIDO",
        "Detail",
        12,
        "A",
        date
      ).status
    ).toBe("FALLIDO")
  })

  it("keeps the template subject nullable and the supplied event/language", () => {
    expect({ ...EmailTemplate.create(3, "bienvenida", "es", null, "Cuerpo") }).toEqual({
      id: 3,
      event: "bienvenida",
      language: "es",
      subject: null,
      body: "Cuerpo"
    })
  })
})
