import { Injector } from "@angular/core"
import { firstValueFrom, Observable, of } from "rxjs"
import { describe, expect, expectTypeOf, it } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { QuickbooksConnection } from "./entities/quickbooks-connection.entity"
import { ExternalSynchronization } from "./entities/external-synchronization.entity"
import { IntegrationEvent } from "./entities/integration-event.entity"
import { QuickbooksError } from "./errors/quickbooks.error"
import {
  QuickbooksStatus,
  SynchronizationSummary,
  IntegrationEventSummary
} from "./models/quickbooks.models"
import { RetrySynchronizationParams } from "./params/quickbooks.params"
import { QUICKBOOKS_REPOSITORY, QuickbooksRepository } from "./repositories/quickbooks.repository"

describe("QuickBooks domain boundary", () => {
  it("resolves all confirmed operations without requiring any OAuth credentials", async () => {
    const error = new QuickbooksError("UNCONFIGURED")
    const failure = () => of(Result.failure(error))
    const status: QuickbooksStatus = {
      isConfigured: false,
      isConnected: false,
      environment: "SANDBOX",
      realmId: null,
      companyName: null,
      connectionStatus: "DESCONECTADO",
      authorizedByName: null,
      accessExpiresAt: null,
      authorizationExpiresAt: null,
      lastConnectedAt: null,
      lastSynchronizedAt: null
    }
    const repository: QuickbooksRepository = {
      getStatus: () => of(Result.success(status)),
      requestAuthorization: failure,
      disconnect: failure,
      synchronizeCustomer: failure,
      invoiceOrder: failure,
      getOrderInvoice: failure,
      refreshOrderPayment: failure,
      getSynchronizations: failure,
      retrySynchronization: failure,
      getEvents: failure
    }
    const injector = Injector.create({
      providers: [{ provide: QUICKBOOKS_REPOSITORY, useValue: repository }]
    })
    const resolved = injector.get(QUICKBOOKS_REPOSITORY)
    expect(resolved).toBe(repository)
    expect(await firstValueFrom(resolved.getStatus())).toEqual(Result.success(status))
    const operations: Observable<unknown>[] = [
      resolved.requestAuthorization(),
      resolved.disconnect(),
      resolved.synchronizeCustomer({ customerId: 1 }),
      resolved.invoiceOrder({ orderId: 2 }),
      resolved.getOrderInvoice({ orderId: 2 }),
      resolved.refreshOrderPayment({ orderId: 2 }),
      resolved.getSynchronizations({ offset: 0, limit: 20, status: "ERROR", entity: "CLIENTE" }),
      resolved.retrySynchronization({ synchronizationId: "9007199254740993" }),
      resolved.getEvents({ result: "ERROR", type: "RESPONSE" })
    ]
    for (const operation of operations)
      expect(await firstValueFrom(operation)).toEqual(Result.failure(error))
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("QuickbooksError")
    expect(error.code).toBe("UNCONFIGURED")
    expect(error.message).toBe("QuickBooks operation failed")
    expect(new QuickbooksError("INTEGRATION_REJECTED", "Safe rejection").message).toBe(
      "Safe rejection"
    )
  })

  it("excludes secret/concurrency fields and cannot invent absent DTO associations", () => {
    type Unsafe =
      | "accessToken"
      | "refreshToken"
      | "accessTokenEnc"
      | "refreshTokenEnc"
      | "clientSecret"
      | "syncToken"
    expectTypeOf<
      Extract<
        keyof QuickbooksConnection | keyof ExternalSynchronization | keyof IntegrationEvent,
        Unsafe
      >
    >().toEqualTypeOf<never>()
    expectTypeOf<
      Extract<
        keyof SynchronizationSummary,
        "connectionId" | "direction" | "createdAt" | "syncToken"
      >
    >().toEqualTypeOf<never>()
    expectTypeOf<
      Extract<
        keyof IntegrationEventSummary,
        "connectionId" | "synchronizationId" | "attemptNumber" | "isProcessed" | "payload"
      >
    >().toEqualTypeOf<never>()
    expectTypeOf<RetrySynchronizationParams["synchronizationId"]>().toEqualTypeOf<string>()
    expectTypeOf<
      Extract<
        keyof QuickbooksRepository,
        "handleCallback" | "processWebhook" | "setCredentials" | "createEvent"
      >
    >().toEqualTypeOf<never>()
  })
})
