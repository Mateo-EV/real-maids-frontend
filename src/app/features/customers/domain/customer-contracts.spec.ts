import { InjectionToken } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { CustomerError, CustomerErrorCode } from "./errors/customer.error"
import { CUSTOMER_REPOSITORY, CustomerRepository } from "./repositories/customer.repository"
import {
  CUSTOMER_CAPABILITIES_REPOSITORY,
  CustomerCapabilitiesRepository
} from "./repositories/customer-capabilities.repository"
import { PROPERTY_REPOSITORY, PropertyRepository } from "./repositories/property.repository"
import {
  ACQUISITION_REPOSITORY,
  AcquisitionRepository
} from "./repositories/acquisition.repository"
import {
  CUSTOMER_RELATIONS_REPOSITORY,
  CustomerRelationsRepository
} from "./repositories/customer-relations.repository"
import { customerFixture, customerInput } from "./customer.fixture"
import { CreatePropertyParams } from "./params/property.params"
import { CreateProspectParams } from "./params/acquisition.params"

const failure = new CustomerError("FORBIDDEN")
const failed = of(Result.failure(failure))

describe("Customer domain contracts", () => {
  it.each<CustomerErrorCode>([
    "CUSTOMER_NOT_FOUND",
    "PROPERTY_NOT_FOUND",
    "PROSPECT_NOT_FOUND",
    "INVALID_INPUT",
    "CONFLICT",
    "FORBIDDEN",
    "UNEXPECTED"
  ])("provides a safe typed Error for %s", code => {
    const error = new CustomerError(code)
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(CustomerError)
    expect(error.code).toBe(code)
    expect(error.name).toBe("CustomerError")
    expect(error.message.length).toBeGreaterThan(0)
    expect(error.message).not.toContain("password")
  })

  it("keeps the five-operation demo repository injectable and nullable create/update inputs explicit", async () => {
    const customer = customerFixture(17, "Nullable", null, null)
    const response = of(Result.success(customer))
    const repository: CustomerRepository = {
      findAll: vi.fn(() => of(Result.success([customer]))),
      findById: vi.fn(() => response),
      create: vi.fn(() => response),
      update: vi.fn(() => response),
      delete: vi.fn(() => of(Result.success(undefined)))
    }
    TestBed.configureTestingModule({
      providers: [{ provide: CUSTOMER_REPOSITORY, useValue: repository }]
    })
    const injected = TestBed.inject(CUSTOMER_REPOSITORY)
    const input = customerInput("Nullable")
    expect(await firstValueFrom(injected.create(input))).toEqual(Result.success(customer))
    expect(repository.create).toHaveBeenCalledExactlyOnceWith(input)
    expect(await firstValueFrom(injected.update({ id: 17, ...input }))).toEqual(
      Result.success(customer)
    )
    expect(repository.update).toHaveBeenCalledExactlyOnceWith({ id: 17, ...input })
    expect(await firstValueFrom(injected.findById(17))).toEqual(Result.success(customer))
    expect(await firstValueFrom(injected.findAll())).toEqual(Result.success([customer]))
    expect(await firstValueFrom(injected.delete(17))).toEqual(Result.success(undefined))
  })

  it("keeps confirmed account/status operations separate from the wired CRUD contract", async () => {
    const repository: CustomerCapabilitiesRepository = {
      setStatus: vi.fn(() => failed),
      linkAccount: vi.fn(() => failed)
    }
    TestBed.configureTestingModule({
      providers: [{ provide: CUSTOMER_CAPABILITIES_REPOSITORY, useValue: repository }]
    })
    const injected = TestBed.inject(CUSTOMER_CAPABILITIES_REPOSITORY)
    expect(await firstValueFrom(injected.linkAccount({ customerId: 1, userId: null }))).toEqual(
      Result.failure(failure)
    )
    expect(repository.linkAccount).toHaveBeenCalledExactlyOnceWith({ customerId: 1, userId: null })
    expect(await firstValueFrom(injected.setStatus({ customerId: 1, isActive: false }))).toEqual(
      Result.failure(failure)
    )
  })

  it("associates property operations with the customer and preserves decimal-string input", async () => {
    const repository: PropertyRepository = {
      findByCustomer: vi.fn(() => failed),
      create: vi.fn(() => failed),
      update: vi.fn(() => failed),
      setStatus: vi.fn(() => failed)
    }
    TestBed.configureTestingModule({
      providers: [{ provide: PROPERTY_REPOSITORY, useValue: repository }]
    })
    const injected = TestBed.inject(PROPERTY_REPOSITORY)
    const params: CreatePropertyParams = {
      alias: null,
      address: "Address",
      city: null,
      region: null,
      postalCode: null,
      areaM2: "123456.70",
      roomCount: null,
      bathroomCount: 0,
      accessInstructions: null,
      doorCode: null,
      hasPets: false
    }
    expect(await firstValueFrom(injected.create(7, params))).toEqual(Result.failure(failure))
    expect(repository.create).toHaveBeenCalledExactlyOnceWith(7, params)
    expect(await firstValueFrom(injected.update(7, { id: 3, ...params }))).toEqual(
      Result.failure(failure)
    )
    expect(await firstValueFrom(injected.findByCustomer(7))).toEqual(Result.failure(failure))
    expect(await firstValueFrom(injected.setStatus(7, 3, false))).toEqual(Result.failure(failure))
  })

  it("keeps proposed acquisition operations typed without an implementation or conversion transition", async () => {
    const repository: AcquisitionRepository = {
      listOrigins: vi.fn(() => failed),
      createOrigin: vi.fn(() => failed),
      updateOrigin: vi.fn(() => failed),
      listStages: vi.fn(() => failed),
      createStage: vi.fn(() => failed),
      updateStage: vi.fn(() => failed),
      listProspects: vi.fn(() => failed),
      findProspect: vi.fn(() => failed),
      createProspect: vi.fn(() => failed),
      updateProspect: vi.fn(() => failed),
      listFollowUps: vi.fn(() => failed),
      addFollowUp: vi.fn(() => failed)
    }
    TestBed.configureTestingModule({
      providers: [{ provide: ACQUISITION_REPOSITORY, useValue: repository }]
    })
    const injected = TestBed.inject(ACQUISITION_REPOSITORY)
    const params: CreateProspectParams = {
      originId: 1,
      stageId: 2,
      name: "Lead",
      email: null,
      phone: null,
      referenceAddress: null,
      observation: null
    }
    expect(await firstValueFrom(injected.createProspect(params))).toEqual(Result.failure(failure))
    expect(repository.createProspect).toHaveBeenCalledExactlyOnceWith(params)
    expect(await firstValueFrom(injected.updateProspect({ id: 3, ...params }))).toEqual(
      Result.failure(failure)
    )
    expect(await firstValueFrom(injected.listProspects({ offset: 20, limit: 10 }))).toEqual(
      Result.failure(failure)
    )
    expect(repository.listProspects).toHaveBeenCalledExactlyOnceWith({ offset: 20, limit: 10 })
    expect(await firstValueFrom(injected.findProspect(3))).toEqual(Result.failure(failure))
    expect(await firstValueFrom(injected.listOrigins())).toEqual(Result.failure(failure))
    expect(
      await firstValueFrom(
        injected.createOrigin({ name: "Referral", description: null, isActive: true })
      )
    ).toEqual(Result.failure(failure))
    expect(
      await firstValueFrom(
        injected.updateOrigin({ id: 1, name: "Referral", description: "Detail", isActive: false })
      )
    ).toEqual(Result.failure(failure))
    expect(await firstValueFrom(injected.listStages())).toEqual(Result.failure(failure))
    expect(
      await firstValueFrom(injected.createStage({ name: "New", order: 1, isFinal: false }))
    ).toEqual(Result.failure(failure))
    expect(
      await firstValueFrom(injected.updateStage({ id: 2, name: "Final", order: 2, isFinal: true }))
    ).toEqual(Result.failure(failure))
    expect(await firstValueFrom(injected.listFollowUps(3))).toEqual(Result.failure(failure))
    expect(
      await firstValueFrom(injected.addFollowUp({ prospectId: 3, stageId: 2, comment: null }))
    ).toEqual(Result.failure(failure))
  })

  it("owns proposed contacts/preferences through customer IDs and permits general preferences", async () => {
    const repository: CustomerRelationsRepository = {
      listContacts: vi.fn(() => failed),
      createContact: vi.fn(() => failed),
      updateContact: vi.fn(() => failed),
      listPreferences: vi.fn(() => failed),
      createPreference: vi.fn(() => failed),
      updatePreference: vi.fn(() => failed)
    }
    TestBed.configureTestingModule({
      providers: [{ provide: CUSTOMER_RELATIONS_REPOSITORY, useValue: repository }]
    })
    const injected = TestBed.inject(CUSTOMER_RELATIONS_REPOSITORY)
    const contact = {
      name: "Contact",
      position: null,
      email: null,
      phone: null,
      isPrimary: false,
      isActive: true
    }
    const preference = {
      propertyId: null,
      type: "Unrestricted catalog value",
      detail: "Detail",
      isActive: true
    }
    expect(await firstValueFrom(injected.listContacts(2))).toEqual(Result.failure(failure))
    expect(await firstValueFrom(injected.createContact(2, contact))).toEqual(
      Result.failure(failure)
    )
    expect(repository.createContact).toHaveBeenCalledExactlyOnceWith(2, contact)
    expect(await firstValueFrom(injected.updateContact(2, { id: 4, ...contact }))).toEqual(
      Result.failure(failure)
    )
    expect(await firstValueFrom(injected.listPreferences(2))).toEqual(Result.failure(failure))
    expect(await firstValueFrom(injected.createPreference(2, preference))).toEqual(
      Result.failure(failure)
    )
    expect(repository.createPreference).toHaveBeenCalledExactlyOnceWith(2, preference)
    expect(await firstValueFrom(injected.updatePreference(2, { id: 5, ...preference }))).toEqual(
      Result.failure(failure)
    )
  })

  it("uses distinct InjectionTokens for independent capability contracts", () => {
    const tokens = [
      CUSTOMER_REPOSITORY,
      CUSTOMER_CAPABILITIES_REPOSITORY,
      PROPERTY_REPOSITORY,
      ACQUISITION_REPOSITORY,
      CUSTOMER_RELATIONS_REPOSITORY
    ]
    expect(new Set(tokens).size).toBe(5)
    tokens.forEach(token => expect(token).toBeInstanceOf(InjectionToken))
  })
})
