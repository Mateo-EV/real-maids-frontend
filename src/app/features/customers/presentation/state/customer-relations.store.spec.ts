import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Observable, of, Subject, throwError } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { Result } from "@/app/shared/utils/result"
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
import { CustomerContact } from "../../domain/entities/customer-contact.entity"
import { CustomerPreference } from "../../domain/entities/customer-preference.entity"
import { customerFixture } from "../../domain/customer.fixture"
import { CustomerRelationsStore } from "./customer-relations.store"
import { CustomerHistoryStore } from "./customer-history.store"

describe("CustomerRelationsStore", () => {
  let contacts: ReturnType<typeof vi.fn>,
    preferences: ReturnType<typeof vi.fn>,
    write: ReturnType<typeof vi.fn>
  let session: BehaviorSubject<AuthSession | null>
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1000)
    session = new BehaviorSubject<AuthSession | null>(
      AuthSession.create("Fixture", "fixture@example.test", null, 9999999, 7)
    )
    contacts = vi.fn(() => of(Result.success([])))
    preferences = vi.fn(() => of(Result.success([])))
    write = vi.fn(() => of(Result.success(undefined)))
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { session: () => session.value } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
        {
          provide: GetCustomerHistoryUseCase,
          useValue: {
            execute: () =>
              of(
                Result.success({
                  customer: customerFixture(1, "Fixture"),
                  requests: { items: [], total: 0, offset: 0, limit: 5 },
                  orders: { items: [], total: 0, offset: 0, limit: 5 },
                  support: { items: [], total: 0, offset: 0, limit: 5 }
                })
              )
          }
        },
        { provide: ListCustomerContactsUseCase, useValue: { execute: contacts } },
        { provide: ListCustomerPreferencesUseCase, useValue: { execute: preferences } },
        ...[
          CreateCustomerContactUseCase,
          UpdateCustomerContactUseCase,
          CreateCustomerPreferenceUseCase,
          UpdateCustomerPreferenceUseCase
        ].map(provide => ({ provide, useValue: { execute: write } }))
      ]
    })
  })
  afterEach(() => vi.restoreAllMocks())
  it("keeps contacts/preferences independent and invalidates just the written relation", () => {
    const store = TestBed.inject(CustomerRelationsStore)
    store.loadContacts(1).subscribe()
    store.loadPreferences(1).subscribe()
    store.loadContacts(2).subscribe()
    store
      .updateContact(1, {
        id: 2,
        name: "Fixture",
        position: null,
        phone: null,
        email: null,
        isPrimary: false,
        isActive: true
      })
      .subscribe()
    expect(store.selectContacts(1).expires).toBe(0)
    expect(store.selectPreferences(1).expires).toBe(121000)
    expect(store.selectContacts(2).expires).toBe(121000)
    vi.mocked(Date.now).mockReturnValue(121000)
    store.loadPreferences(1).subscribe()
    expect(preferences).toHaveBeenCalledTimes(2)
  })
  it("keeps nonempty contacts and preferences through exact TTL expiry and failed refreshes", () => {
    const store = TestBed.inject(CustomerRelationsStore)
    const contact = CustomerContact.create(1, 1, "Fixture", null, null, null, false, true)
    const preference = CustomerPreference.create(1, 1, null, "Fixture", "Fixture detail", true)
    contacts.mockReturnValueOnce(of(Result.success([contact])))
    preferences.mockReturnValueOnce(of(Result.success([preference])))
    store.loadContacts(1).subscribe()
    store.loadPreferences(1).subscribe()
    vi.mocked(Date.now).mockReturnValue(120999)
    store.loadContacts(1).subscribe()
    store.loadPreferences(1).subscribe()
    expect(contacts).toHaveBeenCalledTimes(1)
    expect(preferences).toHaveBeenCalledTimes(1)
    vi.mocked(Date.now).mockReturnValue(121000)
    contacts.mockReturnValueOnce(of(Result.failure(new CustomerError("NETWORK"))))
    preferences.mockReturnValueOnce(of(Result.failure(new CustomerError("FORBIDDEN"))))
    store.loadContacts(1).subscribe()
    store.loadPreferences(1).subscribe()
    expect(store.selectContacts(1)).toMatchObject({
      data: [contact],
      loaded: true,
      expires: 121000,
      error: { code: "NETWORK" }
    })
    expect(store.selectPreferences(1)).toMatchObject({
      data: [preference],
      loaded: true,
      expires: 121000,
      error: { code: "FORBIDDEN" }
    })
    store.loadContacts(1).subscribe()
    store.loadPreferences(1).subscribe()
    expect(contacts).toHaveBeenCalledTimes(3)
    expect(preferences).toHaveBeenCalledTimes(3)
    expect(store.selectContacts(1).expires).toBe(241000)
  })
  it("does not invalidate verified relation data on failed writes or replay the mutation", () => {
    const store = TestBed.inject(CustomerRelationsStore)
    store.loadContacts(1).subscribe()
    store.loadPreferences(1).subscribe()
    write.mockReturnValueOnce(throwError(() => new Error("private transport")))
    store
      .createPreference(1, { propertyId: null, type: "Fixture", detail: "Fixture", isActive: true })
      .subscribe()
    expect(store.preferenceWriteError()?.code).toBe("UNEXPECTED")
    expect(store.contactWriteError()).toBeUndefined()
    expect(store.selectPreferences(1).expires).toBe(121000)
    expect(write).toHaveBeenCalledTimes(1)
  })
  it("keeps relation errors, flights and cancellation independent", () => {
    const store = TestBed.inject(CustomerRelationsStore)
    const pending = new Subject<Result<never[], CustomerError>>()
    contacts.mockReturnValueOnce(pending)
    const a = store.loadContacts(1).subscribe(),
      b = store.loadContacts(1).subscribe()
    expect(contacts).toHaveBeenCalledTimes(1)
    store.loadPreferences(1).subscribe()
    a.unsubscribe()
    expect(store.contactsLoading()).toBe(true)
    expect(store.preferencesLoading()).toBe(false)
    b.unsubscribe()
    expect(store.contactsLoading()).toBe(false)
    contacts.mockReturnValueOnce(of(Result.failure(new CustomerError("FORBIDDEN"))))
    store.loadContacts(1, true).subscribe()
    expect(store.selectContacts(1).error?.code).toBe("FORBIDDEN")
    expect(store.selectPreferences(1).error).toBeUndefined()
    expect(store.selectContacts(1).loaded).toBe(false)
    store.loadContacts(1, true).subscribe()
    expect(store.selectContacts(1).loaded).toBe(true)
    expect(store.selectContacts(1).error).toBeUndefined()
  })
  describe.each(["contact", "preference"] as const)("%s invalidation reentrancy", kind => {
    it.each(["logout", "replacement"])("stops old mutation effects after %s", transition => {
      const store = TestBed.inject(CustomerRelationsStore)
      const h = TestBed.inject(CustomerHistoryStore)
      h.loadHistory(1).subscribe()
      const invalidate = vi.spyOn(h, "invalidateCustomer")
      const pending = new Subject<Result<never[], CustomerError>>()
      const load = kind === "contact" ? contacts : preferences
      load.mockReturnValueOnce(pending)
      const read: Observable<unknown> =
        kind === "contact" ? store.loadContacts(1) : store.loadPreferences(1)
      read.subscribe({
        complete: () => {
          session.next(
            transition === "logout"
              ? null
              : AuthSession.create("Replacement", "second@example.test", null, 9999999, 8)
          )
          h.loadHistory(1).subscribe()
        }
      })
      if (kind === "contact")
        store
          .createContact(1, {
            name: "Fixture",
            position: null,
            email: null,
            phone: null,
            isPrimary: false,
            isActive: true
          })
          .subscribe()
      else
        store
          .createPreference(1, {
            propertyId: null,
            type: "Fixture",
            detail: "Fixture",
            isActive: true
          })
          .subscribe()
      expect(invalidate).not.toHaveBeenCalled()
      expect(h.selectHistory(1).expires).toBe(transition === "logout" ? 0 : 31000)
      expect(store.pendingContactWrites()).toBe(0)
      expect(store.pendingPreferenceWrites()).toBe(0)
      expect(store.contactWriteError()).toBeUndefined()
      expect(store.preferenceWriteError()).toBeUndefined()
      expect(store.selectContacts(1).loaded).toBe(false)
      expect(store.selectPreferences(1).loaded).toBe(false)
    })
  })
})
