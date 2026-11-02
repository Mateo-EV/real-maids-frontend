import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, of, Subject, throwError } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { Result } from "@/app/shared/utils/result"
import {
  ListCustomerPropertiesUseCase,
  CreatePropertyUseCase,
  UpdatePropertyUseCase,
  SetPropertyStatusUseCase
} from "../../application/use-cases/property.use-cases"
import {
  ListCustomerContactsUseCase,
  ListCustomerPreferencesUseCase,
  CreateCustomerContactUseCase,
  UpdateCustomerContactUseCase,
  CreateCustomerPreferenceUseCase,
  UpdateCustomerPreferenceUseCase
} from "../../application/use-cases/customer-relations.use-cases"
import { GetCustomerHistoryUseCase } from "../../application/use-cases/get-customer-history.use-case"
import { CustomerError } from "../../domain/errors/customer.error"
import { Property } from "../../domain/entities/property.entity"
import { customerFixture } from "../../domain/customer.fixture"
import { CustomerHistory } from "../../domain/entities/customer-history"
import { CustomerPropertiesStore } from "./customer-properties.store"
import { CustomerRelationsStore } from "./customer-relations.store"
import { CustomerHistoryStore } from "./customer-history.store"

const history = (id: number): CustomerHistory => ({
  customer: customerFixture(id, "Fixture"),
  requests: { items: [], total: 17, offset: 0, limit: 5 },
  orders: { items: [], total: 2, offset: 0, limit: 5 },
  support: { items: [], total: 0, offset: 0, limit: 5 }
})
describe("CustomerPropertiesStore and cross-capability coherence", () => {
  let list: ReturnType<typeof vi.fn>,
    contacts: ReturnType<typeof vi.fn>,
    preferences: ReturnType<typeof vi.fn>,
    getHistory: ReturnType<typeof vi.fn>,
    write: ReturnType<typeof vi.fn>
  let session: BehaviorSubject<AuthSession | null>
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1000)
    session = new BehaviorSubject<AuthSession | null>(
      AuthSession.create("Fixture", "fixture@example.test", null, 9999999, 7)
    )
    list = vi.fn(() => of(Result.success<Property[]>([])))
    contacts = vi.fn(() => of(Result.success([])))
    preferences = vi.fn(() => of(Result.success([])))
    getHistory = vi.fn((id: number) => of(Result.success(history(id))))
    write = vi.fn(() => of(Result.success(undefined)))
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { session: () => session.value } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
        ...[
          ListCustomerPropertiesUseCase,
          ListCustomerContactsUseCase,
          ListCustomerPreferencesUseCase,
          GetCustomerHistoryUseCase
        ].map((provide, i) => ({
          provide,
          useValue: { execute: [list, contacts, preferences, getHistory][i] }
        })),
        ...[
          CreatePropertyUseCase,
          UpdatePropertyUseCase,
          SetPropertyStatusUseCase,
          CreateCustomerContactUseCase,
          UpdateCustomerContactUseCase,
          CreateCustomerPreferenceUseCase,
          UpdateCustomerPreferenceUseCase
        ].map(provide => ({ provide, useValue: { execute: write } }))
      ]
    })
  })
  afterEach(() => vi.restoreAllMocks())
  it("defers requests and reuses verified empty owner rows until the exact TTL boundary", () => {
    const store = TestBed.inject(CustomerPropertiesStore)
    const read = store.loadProperties(1)
    expect(list).not.toHaveBeenCalled()
    expect(store.selectProperties(1).loaded).toBe(false)
    read.subscribe()
    expect(store.selectProperties(1).loaded).toBe(true)
    vi.mocked(Date.now).mockReturnValue(120999)
    read.subscribe()
    expect(list).toHaveBeenCalledTimes(1)
    vi.mocked(Date.now).mockReturnValue(121000)
    read.subscribe()
    expect(list).toHaveBeenCalledTimes(2)
  })
  it("retains same-key verified data/error without renewing TTL and explicitly retries", () => {
    const store = TestBed.inject(CustomerPropertiesStore)
    store.loadProperties(1).subscribe()
    list.mockReturnValueOnce(throwError(() => new Error("private transport")))
    store.loadProperties(1, true).subscribe()
    expect(store.selectProperties(1)).toMatchObject({
      loaded: true,
      data: [],
      expires: 121000,
      error: { code: "UNEXPECTED" }
    })
    const pending = new Subject<Result<Property[], CustomerError>>()
    list.mockReturnValueOnce(pending)
    store.loadProperties(1, true).subscribe()
    expect(store.selectProperties(1).refreshing).toBe(true)
    expect(store.selectProperties(2).loaded).toBe(false)
    pending.next(Result.failure(new CustomerError("FORBIDDEN")))
    pending.complete()
    expect(store.selectProperties(1).error?.code).toBe("FORBIDDEN")
    store.loadProperties(1, true).subscribe()
    expect(store.selectProperties(1).error).toBeUndefined()
  })
  it("shares same-owner flights with refcount cancellation and independent parallel owners", () => {
    const store = TestBed.inject(CustomerPropertiesStore)
    const pending = new Subject<Result<Property[], CustomerError>>()
    list.mockReturnValue(pending)
    const a = store.loadProperties(1).subscribe(),
      b = store.loadProperties(1, true).subscribe(),
      c = store.loadProperties(2).subscribe()
    expect(list).toHaveBeenCalledTimes(2)
    a.unsubscribe()
    expect(store.selectProperties(1).pendingReads).toBe(1)
    b.unsubscribe()
    expect(store.selectProperties(1).pendingReads).toBe(0)
    expect(store.selectProperties(2).pendingReads).toBe(1)
    c.unsubscribe()
    expect(store.loading()).toBe(false)
  })
  it("invalidates only confirmed affected property reads and fences older completions", () => {
    const store = TestBed.inject(CustomerPropertiesStore)
    store.loadProperties(1).subscribe()
    store.loadProperties(2).subscribe()
    write.mockReturnValueOnce(of(Result.failure(new CustomerError("CONFLICT"))))
    store.setPropertyStatus(1, 3, false).subscribe()
    expect(store.selectProperties(1).expires).toBe(121000)
    expect(store.writeError()?.code).toBe("CONFLICT")
    const old = new Subject<Result<Property[], CustomerError>>()
    list.mockReturnValueOnce(old)
    store.loadProperties(1, true).subscribe()
    store.setPropertyStatus(1, 3, false).subscribe()
    old.next(Result.success([]))
    old.complete()
    expect(store.selectProperties(1).expires).toBe(0)
    expect(store.selectProperties(2).expires).toBe(121000)
    expect(list).toHaveBeenCalledTimes(3)
    expect(write).toHaveBeenCalledTimes(2)
  })
  it("clears/fences all stores on session replacement but preserves same-session renewal", () => {
    const p = TestBed.inject(CustomerPropertiesStore),
      r = TestBed.inject(CustomerRelationsStore),
      h = TestBed.inject(CustomerHistoryStore)
    p.loadProperties(1).subscribe()
    r.loadContacts(1).subscribe()
    h.loadHistory(1).subscribe()
    session.next(AuthSession.create("Renewed", "fixture@example.test", null, 9999999, 7))
    expect(p.selectProperties(1).loaded).toBe(true)
    const pending = new Subject<Result<Property[], CustomerError>>()
    list.mockReturnValueOnce(pending)
    p.loadProperties(1, true).subscribe()
    session.next(null)
    pending.next(Result.success([]))
    expect(p.selectProperties(1).loaded).toBe(false)
    expect(r.selectContacts(1).loaded).toBe(false)
    expect(h.selectHistory(1).loaded).toBe(false)
    expect(p.loading()).toBe(false)
  })
  it("bounds inactive history while retaining in-flight owners", () => {
    const store = TestBed.inject(CustomerPropertiesStore)
    const pending = new Subject<Result<Property[], CustomerError>>()
    list.mockReturnValueOnce(pending)
    const active = store.loadProperties(1).subscribe()
    for (let id = 2; id <= 25; id++) store.loadProperties(id).subscribe()
    expect(store.selectProperties(1).pendingReads).toBe(1)
    expect(Object.keys(store.properties()).length).toBeLessThanOrEqual(21)
    active.unsubscribe()
  })
  it("retains nonempty property values unchanged during revalidation failures", () => {
    const store = TestBed.inject(CustomerPropertiesStore)
    const property = Property.create(
      3,
      1,
      null,
      "Fixture address",
      null,
      null,
      null,
      "12.30",
      1,
      1,
      "Fixture instruction",
      "fixture-code",
      false,
      true,
      new Date(0)
    )
    list.mockReturnValueOnce(of(Result.success([property])))
    store.loadProperties(1).subscribe()
    vi.mocked(Date.now).mockReturnValue(121000)
    list.mockReturnValueOnce(of(Result.failure(new CustomerError("NETWORK"))))
    store.loadProperties(1).subscribe()
    expect(store.selectProperties(1).data).toEqual([property])
    expect(store.selectProperties(1).expires).toBe(121000)
    expect(store.selectProperties(1).error?.code).toBe("NETWORK")
    expect(store.selectProperties(2).data).toEqual([])
  })
  it("settles an empty completion without verifying or renewing freshness", () => {
    const store = TestBed.inject(CustomerPropertiesStore)
    const pending = new Subject<Result<Property[], CustomerError>>()
    list.mockReturnValueOnce(pending)
    store.loadProperties(1).subscribe()
    pending.complete()
    expect(store.selectProperties(1)).toMatchObject({ loaded: false, pendingReads: 0, expires: 0 })
  })
  it("bounds completed owner history at twenty entries", () => {
    const store = TestBed.inject(CustomerPropertiesStore)
    for (let id = 1; id <= 25; id++) store.loadProperties(id).subscribe()
    expect(Object.keys(store.properties())).toHaveLength(20)
    expect(store.selectProperties(1).loaded).toBe(false)
    expect(store.selectProperties(25).loaded).toBe(true)
  })
  it("delegates property create/update and relation writes without optimistic membership or replay", () => {
    const p = TestBed.inject(CustomerPropertiesStore),
      r = TestBed.inject(CustomerRelationsStore),
      h = TestBed.inject(CustomerHistoryStore)
    const property = {
      alias: null,
      address: "Fixture",
      city: null,
      region: null,
      postalCode: null,
      areaM2: null,
      roomCount: null,
      bathroomCount: null,
      accessInstructions: null,
      doorCode: null,
      hasPets: false
    }
    const contact = {
      name: "Fixture",
      position: null,
      email: null,
      phone: null,
      isPrimary: false,
      isActive: true
    }
    const preference = {
      propertyId: null,
      type: "Fixture",
      detail: "Fixture detail",
      isActive: true
    }
    h.loadHistory(1, 5).subscribe()
    h.loadHistory(1, 10).subscribe()
    p.loadProperties(1).subscribe()
    r.loadContacts(1).subscribe()
    r.loadPreferences(1).subscribe()
    p.createProperty(1, property).subscribe()
    expect(write).toHaveBeenLastCalledWith(1, property)
    expect(h.selectHistory(1, 5).expires).toBe(0)
    expect(h.selectHistory(1, 10).expires).toBe(0)
    p.updateProperty(1, { id: 2, ...property }).subscribe()
    expect(write).toHaveBeenLastCalledWith(1, { id: 2, ...property })
    r.createContact(1, contact).subscribe()
    expect(write).toHaveBeenLastCalledWith(1, contact)
    r.createPreference(1, preference).subscribe()
    r.updatePreference(1, { id: 3, ...preference }).subscribe()
    expect(write).toHaveBeenLastCalledWith(1, { id: 3, ...preference })
    expect(write).toHaveBeenCalledTimes(5)
    expect(r.selectPreferences(1)).toMatchObject({ loaded: true, data: [], expires: 0 })
    expect(p.selectProperties(1).data).toEqual([])
  })
  it("cancels writes on session replacement and ignores old success/error feedback", () => {
    const p = TestBed.inject(CustomerPropertiesStore),
      r = TestBed.inject(CustomerRelationsStore)
    const response = new Subject<Result<unknown, CustomerError>>()
    write.mockReturnValue(response)
    p.setPropertyStatus(1, 2, false).subscribe()
    r.createPreference(1, {
      propertyId: null,
      type: "Fixture",
      detail: "Fixture",
      isActive: true
    }).subscribe()
    expect(p.pendingWrites()).toBe(1)
    expect(r.pendingPreferenceWrites()).toBe(1)
    session.next(AuthSession.create("Replacement", "second@example.test", null, 9999999, 8))
    response.next(Result.failure(new CustomerError("FORBIDDEN")))
    response.next(Result.success(undefined))
    expect(p.pendingWrites()).toBe(0)
    expect(r.pendingPreferenceWrites()).toBe(0)
    expect(p.writeError()).toBeUndefined()
    expect(r.preferenceWriteError()).toBeUndefined()
  })
  it.each(["logout", "replacement"])(
    "stops old property mutation effects after reentrant %s",
    transition => {
      const store = TestBed.inject(CustomerPropertiesStore)
      const h = TestBed.inject(CustomerHistoryStore)
      h.loadHistory(1).subscribe()
      const invalidate = vi.spyOn(h, "invalidateCustomer")
      const pending = new Subject<Result<Property[], CustomerError>>()
      list.mockReturnValueOnce(pending)
      store.loadProperties(1).subscribe({
        complete: () => {
          session.next(
            transition === "logout"
              ? null
              : AuthSession.create("Replacement", "second@example.test", null, 9999999, 8)
          )
          h.loadHistory(1).subscribe()
        }
      })
      store.setPropertyStatus(1, 2, false).subscribe()
      expect(invalidate).not.toHaveBeenCalled()
      expect(h.selectHistory(1).expires).toBe(transition === "logout" ? 0 : 31000)
      expect(store.pendingWrites()).toBe(0)
      expect(store.writeError()).toBeUndefined()
      expect(store.selectProperties(1).loaded).toBe(false)
    }
  )
  it("does not dispatch reads or writes on SSR", () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    const p = TestBed.inject(CustomerPropertiesStore),
      r = TestBed.inject(CustomerRelationsStore),
      h = TestBed.inject(CustomerHistoryStore)
    p.loadProperties(1).subscribe()
    p.setPropertyStatus(1, 2, false).subscribe()
    r.loadContacts(1).subscribe()
    r.loadPreferences(1).subscribe()
    h.loadHistory(1).subscribe()
    expect(list).not.toHaveBeenCalled()
    expect(contacts).not.toHaveBeenCalled()
    expect(preferences).not.toHaveBeenCalled()
    expect(getHistory).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })
})
