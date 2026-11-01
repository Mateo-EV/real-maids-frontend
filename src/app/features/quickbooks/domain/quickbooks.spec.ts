import { describe, expect, it } from "vitest"
import { QuickbooksConnection } from "./entities/quickbooks-connection.entity"
import { ExternalSynchronization } from "./entities/external-synchronization.entity"
import { IntegrationEvent } from "./entities/integration-event.entity"

const timestamp = new Date("2026-02-03T04:05:06Z")
const largeId = "9007199254740993"

describe("safe QuickBooks schema factories", () => {
  it.each([null, timestamp])(
    "preserves safe connection metadata and nullable instants %s",
    date => {
      expect(
        QuickbooksConnection.create(
          1,
          7,
          "realm",
          null,
          "custom",
          "CUSTOM",
          date,
          date,
          date,
          date,
          false,
          timestamp,
          timestamp
        )
      ).toEqual({
        id: 1,
        authorizedByUserId: 7,
        realmId: "realm",
        companyName: null,
        environment: "custom",
        connectionStatus: "CUSTOM",
        accessExpiresAt: date,
        authorizationExpiresAt: date,
        lastConnectedAt: date,
        lastSynchronizedAt: date,
        isActive: false,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      expect(
        QuickbooksConnection.create(
          2,
          7,
          "realm-2",
          "Company",
          "SANDBOX",
          "CONECTADO",
          date,
          date,
          date,
          date,
          true,
          timestamp,
          timestamp
        ).companyName
      ).toBe("Company")
    }
  )
  it.each([null, "Sanitized failure"])(
    "preserves BIGINT precision and synchronization summary %s",
    lastErrorSummary => {
      expect(
        ExternalSynchronization.create(
          largeId,
          1,
          "CLIENTE",
          largeId,
          "Customer",
          "remote",
          "ERP_QBO",
          "ERROR",
          0,
          null,
          lastErrorSummary,
          timestamp,
          timestamp
        )
      ).toEqual({
        id: largeId,
        connectionId: 1,
        localEntity: "CLIENTE",
        localId: largeId,
        quickbooksEntity: "Customer",
        externalId: "remote",
        direction: "ERP_QBO",
        status: "ERROR",
        attemptCount: 0,
        lastSynchronizedAt: null,
        lastErrorSummary,
        createdAt: timestamp,
        updatedAt: timestamp
      })
      expect(
        ExternalSynchronization.create(
          "2",
          1,
          "CUSTOM",
          "3",
          "Custom",
          "remote",
          "CUSTOM",
          "CUSTOM",
          2,
          timestamp,
          null,
          timestamp,
          timestamp
        ).lastSynchronizedAt
      ).toEqual(timestamp)
    }
  )
  it("preserves every event field while allowing nullable linkage and safe summaries", () => {
    expect(
      IntegrationEvent.create(
        largeId,
        1,
        null,
        "CUSTOM",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "CUSTOM",
        1,
        null,
        null,
        false,
        timestamp
      )
    ).toEqual({
      id: largeId,
      connectionId: 1,
      synchronizationId: null,
      eventType: "CUSTOM",
      entity: null,
      localId: null,
      externalId: null,
      httpMethod: null,
      endpoint: null,
      httpStatus: null,
      requestId: null,
      result: "CUSTOM",
      attemptNumber: 1,
      errorSummary: null,
      payloadSummary: null,
      isProcessed: false,
      occurredAt: timestamp
    })
    expect(
      IntegrationEvent.create(
        "2",
        1,
        largeId,
        "RESPONSE",
        "CLIENTE",
        largeId,
        "remote",
        "POST",
        "/safe",
        200,
        "request",
        "OK",
        2,
        "Safe",
        "Summary",
        true,
        timestamp
      )
    ).toEqual({
      id: "2",
      connectionId: 1,
      synchronizationId: largeId,
      eventType: "RESPONSE",
      entity: "CLIENTE",
      localId: largeId,
      externalId: "remote",
      httpMethod: "POST",
      endpoint: "/safe",
      httpStatus: 200,
      requestId: "request",
      result: "OK",
      attemptNumber: 2,
      errorSummary: "Safe",
      payloadSummary: "Summary",
      isProcessed: true,
      occurredAt: timestamp
    })
  })
})
