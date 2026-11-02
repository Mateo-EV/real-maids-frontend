import { TestBed } from "@angular/core/testing"
import { PLATFORM_ID } from "@angular/core"
import { EMPTY, of, Subject, throwError, BehaviorSubject, firstValueFrom } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
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
import { CustomersStore } from "./customers.store"

const page = (
  items: Customer[] = [],
  total = items.length,
  offset = 0,
  limit = 20
): PaginationResponse<Customer> => ({ items, total, offset, limit })
type PageResult = Result<PaginationResponse<Customer>, CustomerError>
type ProfileResult = Result<Customer, CustomerError>

describe("CustomersStore", () => {
  let store: InstanceType<typeof CustomersStore>
  let list: ReturnType<typeof vi.fn>,
    detail: ReturnType<typeof vi.fn>,
    create: ReturnType<typeof vi.fn>,
    update: ReturnType<typeof vi.fn>,
    status: ReturnType<typeof vi.fn>
  let session: BehaviorSubject<AuthSession | null>
  beforeEach(() => {
    list = vi.fn()
    detail = vi.fn()
    create = vi.fn()
    update = vi.fn()
    status = vi.fn()
    session = new BehaviorSubject<AuthSession | null>(
      AuthSession.create("Test", "fake@example.test", null, Date.now() + 60000, 7)
    )
    TestBed.configureTestingModule({
      providers: [
        { provide: ListCustomersUseCase, useValue: { execute: list } },
        { provide: GetCustomerByIdUseCase, useValue: { execute: detail } },
        { provide: CreateCustomerUseCase, useValue: { execute: create } },
        { provide: UpdateCustomerUseCase, useValue: { execute: update } },
        { provide: SetCustomerStatusUseCase, useValue: { execute: status } },
        { provide: AuthStore, useValue: { session: () => session.value } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } }
      ]
    })
    store = TestBed.inject(CustomersStore)
  })

  it("distinguishes unknown totals, verified empty and out-of-range empty pages", () => {
    expect(store.total()).toBeNull()
    expect(store.isEmpty()).toBe(false)
    const response = new Subject<PageResult>()
    list.mockReturnValue(response)
    store.loadCustomers().subscribe()
    expect(list).toHaveBeenCalledWith({})
    expect(store.loading()).toBe(true)
    response.next(Result.success(page()))
    response.complete()
    expect(store.loading()).toBe(false)
    expect(store.total()).toBe(0)
    expect(store.isEmpty()).toBe(true)
    list.mockReturnValue(of(Result.success(page([], 21, 40))))
    store.loadCustomers({ offset: 40 }).subscribe()
    expect(store.total()).toBe(21)
    expect(store.offset()).toBe(40)
    expect(store.isEmpty()).toBe(false)
  })

  it("defers work, adopts effective metadata for reload and settles cancellation/empty completion", () => {
    const response = new Subject<PageResult>()
    list.mockReturnValue(response)
    const query = { offset: 400, limit: 200 }
    const request = store.loadCustomers(query)
    query.offset = 0
    expect(list).not.toHaveBeenCalled()
    const subscription = request.subscribe()
    expect(list).toHaveBeenCalledWith({ offset: 400, limit: 200 })
    response.next(Result.success(page([], 21, 200, 100)))
    response.complete()
    expect(store.currentQuery()).toEqual({ offset: 200, limit: 100 })
    list.mockReturnValue(new Subject<PageResult>())
    const reload = store.loadCustomers().subscribe()
    expect(list).toHaveBeenLastCalledWith({ offset: 200, limit: 100 })
    expect(store.total()).toBeNull()
    reload.unsubscribe()
    subscription.unsubscribe()
    expect(store.loading()).toBe(false)
    list.mockReturnValue(EMPTY)
    store.loadCustomers().subscribe()
    expect(store.loading()).toBe(false)
    expect(store.loaded()).toBe(false)
  })

  it("hides another page immediately and fences late page success/failure", () => {
    const customer = customerFixture(1, "First")
    list.mockReturnValueOnce(of(Result.success(page([customer], 41))))
    store.loadCustomers().subscribe()
    const old = new Subject<PageResult>(),
      current = new Subject<PageResult>()
    list.mockReturnValueOnce(old).mockReturnValueOnce(current)
    store.loadCustomers({ offset: 20 }).subscribe()
    expect(store.customers()).toEqual([])
    expect(store.total()).toBeNull()
    expect(store.offset()).toBeNull()
    expect(store.currentQuery()).toBeNull()
    store.loadCustomers({ offset: 40 }).subscribe()
    current.next(Result.success(page([customerFixture(3, "Third")], 41, 40)))
    current.complete()
    old.next(Result.success(page([customer], 41, 20)))
    old.next(Result.failure(new CustomerError("FORBIDDEN")))
    old.complete()
    expect(store.customers().map(c => c.id)).toEqual([3])
    expect(store.total()).toBe(41)
    expect(store.offset()).toBe(40)
    expect(store.error()).toBeNull()
    expect(store.loading()).toBe(false)
  })

  it.each(["create", "update", "deactivate", "reactivate"])(
    "invalidates the verified page only after confirmed %s",
    action => {
      const customer = customerFixture(7, "Selected")
      const confirmed = {
        ...customer,
        name: "Confirmed",
        isActive: action !== "deactivate"
      } as Customer
      list.mockReturnValue(of(Result.success(page([customer], 51, 20))))
      store.loadCustomers({ offset: 20 }).subscribe()
      detail.mockReturnValue(of(Result.success(customer)))
      store.loadCustomer(7).subscribe()
      const response = new Subject<ProfileResult>()
      create.mockReturnValue(response)
      update.mockReturnValue(response)
      status.mockReturnValue(response)
      const write =
        action === "create"
          ? store.createCustomer(customerInput("Selected"))
          : action === "update"
            ? store.updateCustomer(customer)
            : store.setCustomerStatus({ customerId: 7, isActive: confirmed.isActive })
      write.subscribe()
      expect(store.customers()).toEqual([customer])
      expect(store.total()).toBe(51)
      expect(store.successMessage()).toBeNull()
      response.next(Result.success(confirmed))
      response.complete()
      expect(store.selectedCustomer()).toBe(confirmed)
      expect(store.customers()).toEqual([])
      expect(store.total()).toBeNull()
      expect(store.loaded()).toBe(false)
      expect(store.successMessage()).not.toBeNull()
      expect(store.currentQuery()).toEqual({ offset: 20, limit: 20 })
      expect(list).toHaveBeenCalledTimes(1)
    }
  )

  it("fences a list already in flight when a write succeeds", () => {
    const stale = new Subject<PageResult>()
    list.mockReturnValue(stale)
    store.loadCustomers({ offset: 20 }).subscribe()
    create.mockReturnValue(of(Result.success(customerFixture(9, "New"))))
    store.createCustomer(customerInput("New")).subscribe()
    expect(store.loading()).toBe(true)
    stale.next(Result.success(page([customerFixture(7, "Old")], 21, 20)))
    stale.complete()
    expect(store.customers()).toEqual([])
    expect(store.total()).toBeNull()
    expect(store.loaded()).toBe(false)
    expect(store.loading()).toBe(false)
    expect(store.successMessage()).toBe("Customer created successfully")
  })

  it.each(["create", "update", "status"])(
    "failed %s preserves verified rows, counters and selected detail",
    action => {
      const customer = customerFixture(7, "Unchanged")
      list.mockReturnValue(of(Result.success(page([customer], 51, 20))))
      store.loadCustomers({ offset: 20 }).subscribe()
      detail.mockReturnValue(of(Result.success(customer)))
      store.loadCustomer(7).subscribe()
      const failure = Result.failure(new CustomerError("FORBIDDEN"))
      create.mockReturnValue(of(failure))
      update.mockReturnValue(of(failure))
      status.mockReturnValue(of(failure))
      const request =
        action === "create"
          ? store.createCustomer(customerInput("New"))
          : action === "update"
            ? store.updateCustomer(customer)
            : store.setCustomerStatus({ customerId: 7, isActive: false })
      request.subscribe()
      expect(store.customers()).toEqual([customer])
      expect(store.total()).toBe(51)
      expect(store.offset()).toBe(20)
      expect(store.limit()).toBe(20)
      expect(store.loaded()).toBe(true)
      expect(store.selectedCustomer()).toBe(customer)
      expect(store.error()?.code).toBe("FORBIDDEN")
      expect(store.successMessage()).toBeNull()
      store.clearFeedback()
      expect(store.error()).toBeNull()
      expect(store.total()).toBe(51)
    }
  )

  it("keeps effective reload query after invalidation and separates reload failure from confirmed write", () => {
    list.mockReturnValue(of(Result.success(page([], 3, 100, 100))))
    store.loadCustomers({ offset: 200, limit: 200 }).subscribe()
    create.mockReturnValue(of(Result.success(customerFixture(9, "New"))))
    store.createCustomer(customerInput("New")).subscribe()
    expect(store.currentQuery()).toEqual({ offset: 100, limit: 100 })
    expect(store.total()).toBeNull()
    list.mockReturnValue(of(Result.failure(new CustomerError("NETWORK"))))
    store.loadCustomers().subscribe()
    expect(list).toHaveBeenLastCalledWith({ offset: 100, limit: 100 })
    expect(create).toHaveBeenCalledTimes(1)
    expect(store.error()?.code).toBe("NETWORK")
    expect(store.loaded()).toBe(false)
    expect(store.total()).toBeNull()
  })

  it("normalizes list errors and never reports failure as empty", () => {
    list.mockReturnValue(throwError(() => new Error("offline")))
    store.loadCustomers({ offset: -1 }).subscribe()
    expect(store.error()?.code).toBe("UNEXPECTED")
    expect(store.total()).toBeNull()
    expect(store.isEmpty()).toBe(false)
    expect(store.loading()).toBe(false)
  })

  it.each(["logout", "identity", "deadline", "expiry"])(
    "clears page metadata and cancels/fences work on %s",
    reason => {
      const customer = customerFixture(7, "Sensitive")
      list.mockReturnValue(of(Result.success(page([customer], 51, 20))))
      store.loadCustomers({ offset: 20 }).subscribe()
      const read = new Subject<PageResult>(),
        write = new Subject<ProfileResult>()
      list.mockReturnValue(read)
      update.mockReturnValue(write)
      const readNext = vi.fn(),
        writeNext = vi.fn()
      store.loadCustomers().subscribe(readNext)
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
      expect(store.total()).toBeNull()
      expect(store.offset()).toBeNull()
      expect(store.limit()).toBeNull()
      expect(store.currentQuery()).toBeNull()
      expect(store.loaded()).toBe(false)
      expect(store.loading()).toBe(false)
      read.next(Result.success(page([customer])))
      write.next(Result.success(customer))
      expect(readNext).not.toHaveBeenCalled()
      expect(writeNext).not.toHaveBeenCalled()
      expect(store.selectedCustomer()).toBeNull()
      expect(store.successMessage()).toBeNull()
    }
  )

  it("preserves page metadata and pending reads on same-session renewal", () => {
    const customer = customerFixture(7, "Retained")
    list.mockReturnValue(of(Result.success(page([customer], 51, 20))))
    store.loadCustomers({ offset: 20 }).subscribe()
    const response = new Subject<ProfileResult>()
    detail.mockReturnValue(response)
    store.loadCustomer(7).subscribe()
    const old = session.value!
    session.next(AuthSession.create(old.name, old.email, null, old.expiresAt, old.id))
    expect(store.customers()).toEqual([customer])
    expect(store.total()).toBe(51)
    expect(store.currentQuery()).toEqual({ offset: 20, limit: 20 })
    response.next(Result.success(customer))
    response.complete()
    expect(store.selectedCustomer()).toBe(customer)
  })

  it("ignores stale detail failures and preserves selection across list reload", () => {
    const first = new Subject<ProfileResult>(),
      customer = customerFixture(7, "Selected")
    detail.mockReturnValueOnce(first).mockReturnValueOnce(of(Result.success(customer)))
    store.loadCustomer(1).subscribe()
    store.loadCustomer(7).subscribe()
    first.next(Result.failure(new CustomerError("FORBIDDEN")))
    first.complete()
    list.mockReturnValue(of(Result.success(page())))
    store.loadCustomers().subscribe()
    expect(store.selectedCustomer()).toBe(customer)
    expect(store.error()).toBeNull()
  })

  it("rejects unauthenticated work before dispatch", async () => {
    session.next(null)
    expect(await firstValueFrom(store.loadCustomers())).toMatchObject({
      success: false,
      error: { code: "UNAUTHENTICATED" }
    })
    expect(list).not.toHaveBeenCalled()
  })
})

describe("CustomersStore SSR boundary", () => {
  it("dispatches no reads/writes and never initializes Auth on the server", async () => {
    const execute = vi.fn()
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: "server" },
        ...[
          ListCustomersUseCase,
          GetCustomerByIdUseCase,
          CreateCustomerUseCase,
          UpdateCustomerUseCase,
          SetCustomerStatusUseCase
        ].map(provide => ({ provide, useValue: { execute } })),
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
    expect(store.total()).toBeNull()
    expect(store.loading()).toBe(false)
  })
})
