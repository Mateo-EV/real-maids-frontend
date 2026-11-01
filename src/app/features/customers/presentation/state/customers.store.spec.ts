import { TestBed } from "@angular/core/testing"
import { EMPTY, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { CreateCustomerUseCase } from "../../application/use-cases/create-customer.use-case"
import { DeleteCustomerUseCase } from "../../application/use-cases/delete-customer.use-case"
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
  let deleteCustomerUseCase: { execute: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    listCustomersUseCase = { execute: vi.fn() }
    getCustomerByIdUseCase = { execute: vi.fn() }
    createCustomerUseCase = { execute: vi.fn() }
    updateCustomerUseCase = { execute: vi.fn() }
    deleteCustomerUseCase = { execute: vi.fn() }
    TestBed.configureTestingModule({
      providers: [
        CustomersStore,
        { provide: ListCustomersUseCase, useValue: listCustomersUseCase },
        { provide: GetCustomerByIdUseCase, useValue: getCustomerByIdUseCase },
        { provide: CreateCustomerUseCase, useValue: createCustomerUseCase },
        { provide: UpdateCustomerUseCase, useValue: updateCustomerUseCase },
        { provide: DeleteCustomerUseCase, useValue: deleteCustomerUseCase }
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

  it("loads a customer and applies create, update, and delete results to presentation state", () => {
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

    deleteCustomerUseCase.execute.mockReturnValue(of(Result.success(undefined)))
    store.deleteCustomer(updated.id).subscribe()
    expect(store.customers()).toEqual([created])
    expect(store.selectedCustomer()).toBeNull()
    expect(store.successMessage()).toBe("Customer deleted successfully")
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
