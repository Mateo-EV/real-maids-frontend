import { describe, expect, it } from "vitest"
import { LandingSection } from "./entities/landing-section.entity"
import { LandingContent } from "./entities/landing-content.entity"
import { WebForm } from "./entities/web-form.entity"

const timestamp = new Date("2026-02-03T04:05:06Z")

describe("web content schema factories", () => {
  it("preserves every section field, including false and zero", () => {
    expect(LandingSection.create(1, "hero", "Welcome", 0, false)).toEqual({
      id: 1,
      key: "hero",
      name: "Welcome",
      order: 0,
      isVisible: false
    })
  })

  it.each([null, timestamp])("preserves nullable content and update timestamp %s", updatedAt => {
    expect(LandingContent.create(2, 1, "fr-CA", null, null, null, false, updatedAt, null)).toEqual({
      id: 2,
      sectionId: 1,
      language: "fr-CA",
      title: null,
      body: null,
      imageUrl: null,
      isPublished: false,
      updatedAt,
      registeredByUserId: null
    })
    expect(
      LandingContent.create(3, 1, "es", "Title", "Body", "/image.webp", true, updatedAt, 7)
    ).toEqual({
      id: 3,
      sectionId: 1,
      language: "es",
      title: "Title",
      body: "Body",
      imageUrl: "/image.webp",
      isPublished: true,
      updatedAt,
      registeredByUserId: 7
    })
  })

  it("preserves full and nullable web submissions without manufacturing lead identity", () => {
    expect(WebForm.create(4, null, "Visitor", null, null, null, null, false, timestamp)).toEqual({
      id: 4,
      leadId: null,
      name: "Visitor",
      email: null,
      phone: null,
      message: null,
      originIp: null,
      isProcessed: false,
      submittedAt: timestamp
    })
    expect(
      WebForm.create(
        5,
        6,
        "Visitor",
        "visitor@example.test",
        "123",
        "Hello",
        "::1",
        true,
        timestamp
      )
    ).toEqual({
      id: 5,
      leadId: 6,
      name: "Visitor",
      email: "visitor@example.test",
      phone: "123",
      message: "Hello",
      originIp: "::1",
      isProcessed: true,
      submittedAt: timestamp
    })
  })
})
