import { describe, expect, it } from "vitest"
import { Customer, CustomerType } from "./customer.entity"
import { LeadOrigin } from "./lead-origin.entity"
import { FunnelStage } from "./funnel-stage.entity"
import { Lead } from "./lead.entity"
import { LeadFollowUp } from "./lead-follow-up.entity"
import { CustomerContact } from "./customer-contact.entity"
import { Property } from "./property.entity"
import { CustomerPreference } from "./customer-preference.entity"

const date = new Date("2026-03-01T12:34:56Z")
describe("Customer schema factories", () => {
  it("preserves all customer fields and SQL wire values", () => {
    expect(CustomerType.RESIDENTIAL).toBe("residencial")
    expect(CustomerType.COMMERCIAL).toBe("comercial")
    expect(
      Customer.create(
        1,
        "Customer",
        null,
        CustomerType.RESIDENTIAL,
        null,
        null,
        null,
        null,
        null,
        true,
        date,
        null,
        null,
        null
      )
    ).toEqual({
      id: 1,
      name: "Customer",
      userId: null,
      type: CustomerType.RESIDENTIAL,
      email: null,
      phone: null,
      taxIdentification: null,
      systemOrigin: null,
      externalId: null,
      isActive: true,
      createdAt: date,
      updatedAt: null,
      registeredByUserId: null,
      leadId: null
    })
    expect(
      Customer.create(
        2,
        "Business",
        3,
        CustomerType.COMMERCIAL,
        "a@example.com",
        "123",
        "tax",
        "source",
        "external",
        false,
        date,
        date,
        4,
        5
      )
    ).toEqual({
      id: 2,
      name: "Business",
      userId: 3,
      type: CustomerType.COMMERCIAL,
      email: "a@example.com",
      phone: "123",
      taxIdentification: "tax",
      systemOrigin: "source",
      externalId: "external",
      isActive: false,
      createdAt: date,
      updatedAt: date,
      registeredByUserId: 4,
      leadId: 5
    })
  })
  it("preserves catalog fields without closing extensible values", () => {
    expect(LeadOrigin.create(1, "Referral", null, false)).toEqual({
      id: 1,
      name: "Referral",
      description: null,
      isActive: false
    })
    expect(FunnelStage.create(2, "Custom stage", 7, true)).toEqual({
      id: 2,
      name: "Custom stage",
      order: 7,
      isFinal: true
    })
  })
  it("preserves lead and follow-up relationships, dates and nullable fields", () => {
    expect(Lead.create(1, 2, 3, "Lead", null, null, null, null, false, date, null)).toEqual({
      id: 1,
      originId: 2,
      stageId: 3,
      name: "Lead",
      email: null,
      phone: null,
      referenceAddress: null,
      observation: null,
      isConverted: false,
      registeredAt: date,
      registeredByUserId: null
    })
    expect(LeadFollowUp.create(1, 2, 3, 4, null, date)).toEqual({
      id: 1,
      leadId: 2,
      userId: 3,
      stageId: 4,
      comment: null,
      occurredAt: date
    })
  })
  it("preserves all contact and preference fields including nullable property IDs", () => {
    expect(CustomerContact.create(1, 2, "Contact", null, null, null, true, false)).toEqual({
      id: 1,
      customerId: 2,
      name: "Contact",
      position: null,
      email: null,
      phone: null,
      isPrimary: true,
      isActive: false
    })
    expect(CustomerPreference.create(1, 2, null, "Custom", "Detail", false)).toEqual({
      id: 1,
      customerId: 2,
      propertyId: null,
      type: "Custom",
      detail: "Detail",
      isActive: false
    })
  })
  it("retains populated optional catalog, lead, follow-up and relationship values", () => {
    expect(LeadOrigin.create(9, "Partner", "Description", true)).toEqual({
      id: 9,
      name: "Partner",
      description: "Description",
      isActive: true
    })
    expect(
      Lead.create(
        10,
        9,
        8,
        "Lead",
        "lead@example.com",
        "0123",
        "Reference",
        "Observation",
        true,
        date,
        7
      )
    ).toEqual({
      id: 10,
      originId: 9,
      stageId: 8,
      name: "Lead",
      email: "lead@example.com",
      phone: "0123",
      referenceAddress: "Reference",
      observation: "Observation",
      isConverted: true,
      registeredAt: date,
      registeredByUserId: 7
    })
    expect(LeadFollowUp.create(11, 10, 7, 8, "Called", date)).toEqual({
      id: 11,
      leadId: 10,
      userId: 7,
      stageId: 8,
      comment: "Called",
      occurredAt: date
    })
    expect(
      CustomerContact.create(
        12,
        2,
        "Contact",
        "Manager",
        "contact@example.com",
        "0123",
        false,
        true
      )
    ).toEqual({
      id: 12,
      customerId: 2,
      name: "Contact",
      position: "Manager",
      email: "contact@example.com",
      phone: "0123",
      isPrimary: false,
      isActive: true
    })
    expect(CustomerPreference.create(13, 2, 14, "Unlisted type", "Detail", true)).toEqual({
      id: 13,
      customerId: 2,
      propertyId: 14,
      type: "Unlisted type",
      detail: "Detail",
      isActive: true
    })
    expect(LeadFollowUp.create(1, 2, 3, 4, null, date).occurredAt.getTime()).toBe(
      Date.parse("2026-03-01T12:34:56Z")
    )
    expect(
      Property.create(
        1,
        2,
        null,
        "Address",
        null,
        null,
        null,
        "1.00",
        null,
        null,
        null,
        null,
        false,
        true,
        date
      ).areaM2
    ).toBe("1.00")
  })
  it("retains decimal precision, access data and every property field", () => {
    expect(
      Property.create(
        1,
        2,
        "Home",
        "Address",
        "City",
        "Region",
        "00001",
        "999999.99",
        0,
        2,
        "Instructions",
        "0010",
        true,
        false,
        date
      )
    ).toEqual({
      id: 1,
      customerId: 2,
      alias: "Home",
      address: "Address",
      city: "City",
      region: "Region",
      postalCode: "00001",
      areaM2: "999999.99",
      roomCount: 0,
      bathroomCount: 2,
      accessInstructions: "Instructions",
      doorCode: "0010",
      hasPets: true,
      isActive: false,
      createdAt: date
    })
    expect(
      Property.create(
        2,
        3,
        null,
        "Address",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        false,
        true,
        date
      )
    ).toEqual({
      id: 2,
      customerId: 3,
      alias: null,
      address: "Address",
      city: null,
      region: null,
      postalCode: null,
      areaM2: null,
      roomCount: null,
      bathroomCount: null,
      accessInstructions: null,
      doorCode: null,
      hasPets: false,
      isActive: true,
      createdAt: date
    })
  })
})
