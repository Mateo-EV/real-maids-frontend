import { TestBed } from "@angular/core/testing"
import { PLATFORM_ID } from "@angular/core"
import { EMPTY, of, Subject, throwError, BehaviorSubject, firstValueFrom } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { CreateCustomerUseCase } from "../../application/use-cases/create-customer.use-case"
import { SetCustomerStatusUseCase } from "../../application/use-cases/set-customer-status.use-case"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { GetCustomerByIdUseCase } from "../../application/use-cases/get-customer-by-id.use-case"
import { ListCustomersUseCase } from "../../application/use-cases/list-customers.use-case"
import { UpdateCustomerUseCase } from "../../application/use-cases/update-customer.use-case"
import { Customer } from "../../domain/entities/customer.entity"
import { customerFixture, customerInput } from "../../domain/customer.fixture"
import { CustomerError } from "../../domain/errors/customer.error"
import type { Result as CustomerResult } from "@/app/shared/utils/result"
import { CustomersStore } from "./customers.store"

describe("CustomersStore", () => {
  let store: InstanceType<typeof CustomersStore>
  let listCustomersUseCase: { execute: ReturnType<typeof vi.fn> }
  let getCustomerByIdUseCase: { execute: ReturnType<typeof vi.fn> }
  let createCustomerUseCase: { execute: ReturnType<typeof vi.fn> }
  let updateCustomerUseCase: { execute: ReturnType<typeof vi.fn> }
  let setCustomerStatusUseCase: { execute: ReturnType<typeof vi.fn> }
  let session: BehaviorSubject<AuthSession | null>

  beforeEach(() => {
    listCustomersUseCase = { execute: vi.fn() }
    getCustomerByIdUseCase = { execute: vi.fn() }
    createCustomerUseCase = { execute: vi.fn() }
    updateCustomerUseCase = { execute: vi.fn() }
    setCustomerStatusUseCase = { execute: vi.fn() }
    session = new BehaviorSubject<AuthSession | null>(
      AuthSession.create("Test", "fake@example.test", null, Date.now() + 60000, 7)
    )
    TestBed.configureTestingModule({
      providers: [
        CustomersStore,
        { provide: ListCustomersUseCase, useValue: listCustomersUseCase },
        { provide: GetCustomerByIdUseCase, useValue: getCustomerByIdUseCase },
        { provide: CreateCustomerUseCase, useValue: createCustomerUseCase },
        { provide: UpdateCustomerUseCase, useValue: updateCustomerUseCase },
        { provide: SetCustomerStatusUseCase, useValue: setCustomerStatusUseCase },
        { provide: AuthStore, useValue: { session: () => session.value } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } }
      ]
    })
    store = TestBed.inject(CustomersStore)
  })

  it("exposes loading and an empty result when the catalog succeeds empty", () => {
    const response = new Subject<CustomerResult<readonly Customer[], CustomerError>>()
    listCustomersUseCase.execute.mockReturnValue(response)

    expect(store.isEmpty()).toBe(false)
    store.loadCustomers().subscribe()
    expect(store.loading()).toBe(true)
    expect(store.isEmpty()).toBe(false)

    response.next(Result.success([]))
    response.complete()
    expect(store.loading()).toBe(false)
    expect(store.customers()).toEqual([])
    expect(store.isEmpty()).toBe(true)
    expect(store.error()).toBeNull()
  })

  it("defers work until subscription and clears loading after cancellation or empty completion", () => {
    const response = new Subject<CustomerResult<readonly Customer[], CustomerError>>()
    listCustomersUseCase.execute.mockReturnValue(response)

    const request = store.loadCustomers()
    expect(listCustomersUseCase.execute).not.toHaveBeenCalled()
    expect(store.loading()).toBe(false)

    const subscription = request.subscribe()
    expect(listCustomersUseCase.execute).toHaveBeenCalledOnce()
    expect(store.loading()).toBe(true)
    subscription.unsubscribe()
    expect(store.loading()).toBe(false)

    listCustomersUseCase.execute.mockReturnValue(EMPTY)
    store.loadCustomers().subscribe()
    expect(store.loading()).toBe(false)
  })

  it("keeps loading active for overlapping work and ignores a stale list after a mutation", () => {
    const existing = customerFixture(1, "María López", "maria@example.com")
    const created = customerFixture(2, "Ana Torres", "ana@example.com")
    listCustomersUseCase.execute.mockReturnValue(of(Result.success([existing])))
    store.loadCustomers().subscribe()

    const staleListResponse = new Subject<CustomerResult<readonly Customer[], CustomerError>>()
    listCustomersUseCase.execute.mockReturnValue(staleListResponse)
    const staleListSubscription = store.loadCustomers().subscribe()

    const createResponse = new Subject<CustomerResult<Customer, CustomerError>>()
    createCustomerUseCase.execute.mockReturnValue(createResponse)
    const createSubscription = store
      .createCustomer(customerInput(created.name, created.email))
      .subscribe()

    expect(store.loading()).toBe(true)
    createResponse.next(Result.success(created))
    createResponse.complete()
    expect(store.loading()).toBe(true)
    expect(store.customers()).toEqual([existing, created])

    staleListResponse.next(Result.success([existing]))
    staleListResponse.complete()
    expect(store.loading()).toBe(false)
    expect(store.customers()).toEqual([existing, created])

    staleListSubscription.unsubscribe()
    createSubscription.unsubscribe()
  })

  it("stores list failures and normalizes unexpected observable errors", () => {
    const expectedError = new CustomerError("CUSTOMER_NOT_FOUND")
    listCustomersUseCase.execute.mockReturnValue(of(Result.failure(expectedError)))
    store.loadCustomers().subscribe()
    expect(store.error()).toBe(expectedError)
    expect(store.isEmpty()).toBe(false)

    listCustomersUseCase.execute.mockReturnValue(throwError(() => new Error("offline")))
    store.loadCustomers().subscribe()
    expect(store.error()).toMatchObject({ code: "UNEXPECTED" })
    expect(store.loading()).toBe(false)
  })

  it("loads a customer and applies confirmed create, update, and status results to presentation state", () => {
    const customer = customerFixture(1, "María López", "maria@example.com")
    const created = customerFixture(2, "Ana Torres", "ana@example.com")
    const updated = customerFixture(1, "María Torres", "maria.torres@example.com")
    listCustomersUseCase.execute.mockReturnValue(of(Result.success([customer])))
    store.loadCustomers().subscribe()

    getCustomerByIdUseCase.execute.mockReturnValue(of(Result.success(customer)))
    store.loadCustomer(customer.id).subscribe()
    expect(store.selectedCustomer()).toBe(customer)

    createCustomerUseCase.execute.mockReturnValue(of(Result.success(created)))
    store.createCustomer(customerInput(created.name, created.email)).subscribe()
    expect(store.customers()).toEqual([customer, created])
    expect(store.successMessage()).toBe("Customer created successfully")

    updateCustomerUseCase.execute.mockReturnValue(of(Result.success(updated)))
    store.updateCustomer(updated).subscribe()
    expect(store.customers()).toEqual([updated, created])
    expect(store.selectedCustomer()).toBe(updated)

    const inactive = { ...updated, isActive: false } as Customer
    setCustomerStatusUseCase.execute.mockReturnValue(of(Result.success(inactive)))
    store.setCustomerStatus({ customerId: updated.id, isActive: false }).subscribe()
    expect(store.customers()).toEqual([created])
    expect(store.selectedCustomer()).toBe(inactive)
    expect(store.successMessage()).toBe("Customer status updated successfully")
  })

  it.each(["logout", "identity", "deadline", "expiry"])(
    "clears and fences reads/writes on %s",
    reason => {
      const customer = customerFixture(7, "Sensitive")
      listCustomersUseCase.execute.mockReturnValue(of(Result.success([customer])))
      store.loadCustomers().subscribe()
      const read = new Subject<CustomerResult<Customer, CustomerError>>()
      const write = new Subject<CustomerResult<Customer, CustomerError>>()
      getCustomerByIdUseCase.execute.mockReturnValue(read)
      updateCustomerUseCase.execute.mockReturnValue(write)
      const readNext = vi.fn(),
        writeNext = vi.fn()
      store.loadCustomer(7).subscribe(readNext)
      store.updateCustomer(customer).subscribe(writeNext)
      const old = session.value!
      session.next(
        reason === "logout"
          ? null
          : AuthSession.create(
              old.name,
              old.email,
              null,
              reason === "expiry"
                ? Date.now() - 1
                : reason === "deadline"
                  ? old.expiresAt! + 10000
                  : old.expiresAt,
              reason === "identity" ? 8 : 7
            )
      )
      expect(store.customers()).toEqual([])
      expect(store.loaded()).toBe(false)
      expect(store.loading()).toBe(false)
      read.next(Result.success(customer))
      write.next(Result.success(customer))
      expect(readNext).not.toHaveBeenCalled()
      expect(writeNext).not.toHaveBeenCalled()
      expect(store.selectedCustomer()).toBeNull()
      expect(store.successMessage()).toBeNull()
    }
  )

  it("preserves state and pending reads on same-session credential renewal", () => {
    const customer = customerFixture(7, "Retained")
    listCustomersUseCase.execute.mockReturnValue(of(Result.success([customer])))
    store.loadCustomers().subscribe()
    const response = new Subject<CustomerResult<Customer, CustomerError>>()
    getCustomerByIdUseCase.execute.mockReturnValue(response)
    store.loadCustomer(7).subscribe()
    const old = session.value!
    session.next(AuthSession.create(old.name, old.email, null, old.expiresAt, old.id))
    expect(store.customers()).toEqual([customer])
    response.next(Result.success(customer))
    response.complete()
    expect(store.selectedCustomer()).toBe(customer)
  })

  it("fences stale detail failures and confirmed inactive status stays out of refreshed active list", () => {
    const first = new Subject<CustomerResult<Customer, CustomerError>>()
    const customer = customerFixture(7, "Active")
    getCustomerByIdUseCase.execute
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(of(Result.success(customer)))
    store.loadCustomer(1).subscribe()
    store.loadCustomer(7).subscribe()
    first.next(Result.failure(new CustomerError("FORBIDDEN")))
    first.complete()
    expect(store.error()).toBeNull()
    expect(store.selectedCustomer()).toBe(customer)
    setCustomerStatusUseCase.execute.mockReturnValue(
      of(Result.success({ ...customer, isActive: false } as Customer))
    )
    store.setCustomerStatus({ customerId: 7, isActive: false }).subscribe()
    expect(store.customers()).toEqual([])
    listCustomersUseCase.execute.mockReturnValue(of(Result.success([])))
    store.loadCustomers().subscribe()
    expect(store.isEmpty()).toBe(true)
    setCustomerStatusUseCase.execute.mockReturnValue(of(Result.success(customer)))
    store.setCustomerStatus({ customerId: 7, isActive: true }).subscribe()
    expect(store.customers()).toEqual([customer])
  })

  it("rejects unauthenticated work before dispatch", () => {
    session.next(null)
    const next = vi.fn()
    store.loadCustomers().subscribe(next)
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        error: expect.objectContaining({ code: "UNAUTHENTICATED" })
      })
    )
    expect(listCustomersUseCase.execute).not.toHaveBeenCalled()
  })

  it("clears feedback without changing catalog state", () => {
    const failure = new CustomerError("CUSTOMER_NOT_FOUND")
    getCustomerByIdUseCase.execute.mockReturnValue(of(Result.failure(failure)))
    store.loadCustomer(404).subscribe()

    store.clearFeedback()

    expect(store.error()).toBeNull()
    expect(store.successMessage()).toBeNull()
    expect(store.selectedCustomer()).toBeNull()
  })
})

describe("CustomersStore SSR boundary", () => {
  it("dispatches no reads/writes and never initializes Auth on the server", async () => {
    const execute = vi.fn()
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: "server" },
        { provide: ListCustomersUseCase, useValue: { execute } },
        { provide: GetCustomerByIdUseCase, useValue: { execute } },
        { provide: CreateCustomerUseCase, useValue: { execute } },
        { provide: UpdateCustomerUseCase, useValue: { execute } },
        { provide: SetCustomerStatusUseCase, useValue: { execute } },
        {
          provide: AuthStore,
          useFactory: () => {
            throw new Error("SSR must not initialize Auth")
          }
        }
      ]
    })
    const store = TestBed.inject(CustomersStore)
    expect(await firstValueFrom(store.loadCustomers())).toMatchObject({ success: false })
    expect(
      await firstValueFrom(store.setCustomerStatus({ customerId: 7, isActive: false }))
    ).toMatchObject({ success: false })
    expect(execute).not.toHaveBeenCalled()
    expect(store.customers()).toEqual([])
    expect(store.loading()).toBe(false)
  })
})
