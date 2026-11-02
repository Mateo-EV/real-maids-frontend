import { TestBed } from "@angular/core/testing"
import { PLATFORM_ID } from "@angular/core"
import { EMPTY, of, Subject, throwError, BehaviorSubject, firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
import { CustomerHistoryStore } from "./customer-history.store"
import { LinkCustomerAccountUseCase } from "../../application/use-cases/link-customer-account.use-case"

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
    status: ReturnType<typeof vi.fn>,
    link: ReturnType<typeof vi.fn>,
    invalidateHistory: ReturnType<typeof vi.fn>
  let session: BehaviorSubject<AuthSession | null>
  beforeEach(() => {
    list = vi.fn()
    detail = vi.fn()
    create = vi.fn()
    update = vi.fn()
    status = vi.fn()
    link = vi.fn()
    invalidateHistory = vi.fn()
    session = new BehaviorSubject<AuthSession | null>(
      AuthSession.create("Test", "fake@example.test", null, Date.now() + 60000, 7)
    )
    TestBed.configureTestingModule({
      providers: [
        { provide: CustomerHistoryStore, useValue: { invalidateCustomer: invalidateHistory } },
        { provide: LinkCustomerAccountUseCase, useValue: { execute: link } },
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

  afterEach(() => vi.restoreAllMocks())

  it("shares same-key detail reads and caches only successful results", () => {
    const customer = customerFixture(7, "Shared")
    const response = new Subject<ProfileResult>()
    detail.mockReturnValue(response)
    const a = store.loadCustomer(7).subscribe(),
      b = store.loadCustomer(7).subscribe()
    expect(detail).toHaveBeenCalledTimes(1)
    a.unsubscribe()
    expect(response.observed).toBe(true)
    response.next(Result.success(customer))
    response.complete()
    b.unsubscribe()
    store.loadCustomer(7).subscribe()
    expect(detail).toHaveBeenCalledTimes(1)
    expect(store.selectedCustomer()).toBe(customer)
  })

  it("reuses verified same-query pages for two minutes without extending freshness on reads", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    list.mockReturnValue(of(Result.success(page())))
    store.loadCustomers().subscribe()
    now.mockReturnValue(120999)
    store.loadCustomers().subscribe()
    expect(list).toHaveBeenCalledTimes(1)
    now.mockReturnValue(121000)
    store.loadCustomers().subscribe()
    expect(list).toHaveBeenCalledTimes(2)
    now.mockRestore()
  })

  it("distinguishes unknown totals, verified empty and out-of-range empty pages", () => {
    expect(store.total()).toBeNull()
    expect(store.isEmpty()).toBe(false)
    const response = new Subject<PageResult>()
    list.mockReturnValue(response)
    store.loadCustomers().subscribe()
    expect(list).toHaveBeenCalledWith({ offset: 0, limit: 20 })
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
    const reload = store.loadCustomers(undefined, true).subscribe()
    expect(list).toHaveBeenLastCalledWith({ offset: 200, limit: 100 })
    expect(store.total()).toBe(21)
    expect(store.refreshing()).toBe(true)
    reload.unsubscribe()
    subscription.unsubscribe()
    expect(store.loading()).toBe(false)
    list.mockReturnValue(EMPTY)
    store.loadCustomers(undefined, true).subscribe()
    expect(store.loading()).toBe(false)
    expect(store.loaded()).toBe(true)
    expect(store.error()?.code).toBe("INVALID_RESPONSE")
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
      expect(store.customers()).toEqual([customer])
      expect(store.total()).toBe(51)
      expect(store.loaded()).toBe(true)
      expect(store.selectQuery({ offset: 20 }).expires).toBe(0)
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
    expect(store.loading()).toBe(false)
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
    expect(store.total()).toBe(3)
    list.mockReturnValue(of(Result.failure(new CustomerError("NETWORK"))))
    store.loadCustomers().subscribe()
    expect(list).toHaveBeenLastCalledWith({ offset: 100, limit: 100 })
    expect(create).toHaveBeenCalledTimes(1)
    expect(store.error()?.code).toBe("NETWORK")
    expect(store.loaded()).toBe(true)
    expect(store.total()).toBe(3)
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
      store.loadCustomers(undefined, true).subscribe(readNext)
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

  it("retains only same-query stale rows on failed refresh and retries without extending TTL", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    const customer = customerFixture(7, "Retained")
    list.mockReturnValueOnce(of(Result.success(page([customer], 51, 20))))
    store.loadCustomers({ offset: 20 }).subscribe()
    expect(store.selectQuery({ offset: 20 }).expires).toBe(121000)
    now.mockReturnValue(121000)
    const response = new Subject<PageResult>()
    list.mockReturnValue(response)
    store.loadCustomers().subscribe()
    expect(store.customers()).toEqual([customer])
    expect(store.refreshing()).toBe(true)
    expect(store.loading()).toBe(false)
    response.next(Result.failure(new CustomerError("NETWORK")))
    response.complete()
    expect(store.selectQuery({ offset: 20 })).toMatchObject({
      refreshing: false,
      expires: 0,
      error: { code: "NETWORK" }
    })
    expect(store.total()).toBe(51)
    list.mockReturnValue(of(Result.success(page([], 0, 0))))
    store.loadCustomers().subscribe()
    expect(store.total()).toBe(0)
    expect(store.selectQuery({ offset: 20 }).expires).toBe(241000)
    expect(list).toHaveBeenCalledTimes(3)
  })

  it("shares page flights until the final consumer cancels", () => {
    const response = new Subject<PageResult>()
    list.mockReturnValue(response)
    const first = store.readPage({ offset: 20 }).subscribe()
    const second = store.readPage({ offset: 20 }, true).subscribe()
    expect(list).toHaveBeenCalledTimes(1)
    first.unsubscribe()
    expect(response.observed).toBe(true)
    second.unsubscribe()
    expect(response.observed).toBe(false)
    expect(store.selectQuery({ offset: 20 })).toMatchObject({
      loading: false,
      result: undefined,
      expires: 0
    })
  })

  it("deduplicates synchronous failed mutation refreshes across page/detail observers", () => {
    const customer = customerFixture(7, "Shared")
    list.mockReturnValue(of(Result.success(page([customer], 51))))
    detail.mockReturnValue(of(Result.success(customer)))
    const subscriptions = [
      store.observeQuery().subscribe(),
      store.observeQuery().subscribe(),
      store.observeCustomer(7).subscribe(),
      store.observeCustomer(7).subscribe()
    ]
    expect(list).toHaveBeenCalledTimes(1)
    expect(detail).toHaveBeenCalledTimes(1)
    list.mockReturnValue(of(Result.failure(new CustomerError("NETWORK"))))
    detail.mockReturnValue(of(Result.failure(new CustomerError("NETWORK"))))
    update.mockReturnValue(of(Result.success(customer)))
    store.updateCustomer(customer).subscribe()
    expect(list).toHaveBeenCalledTimes(2)
    expect(detail).toHaveBeenCalledTimes(2)
    expect(store.selectQuery().result?.total).toBe(51)
    expect(store.selectQuery().error?.code).toBe("NETWORK")
    expect(store.selectCustomer(7).result).toBe(customer)
    expect(invalidateHistory).toHaveBeenCalledExactlyOnceWith(7)
    subscriptions.forEach(s => s.unsubscribe())
    store.invalidateCustomers(7)
    expect(list).toHaveBeenCalledTimes(2)
    expect(detail).toHaveBeenCalledTimes(2)
    expect(update).toHaveBeenCalledTimes(1)
  })

  it("does not cancel an unrelated customer's observed detail on invalidation", () => {
    const response = new Subject<ProfileResult>()
    detail.mockReturnValue(response)
    const subscription = store.observeCustomer(8).subscribe()
    store.invalidateCustomers(7)
    expect(response.observed).toBe(true)
    response.next(Result.success(customerFixture(8, "Other")))
    response.complete()
    expect(store.selectCustomer(8).result?.id).toBe(8)
    subscription.unsubscribe()
  })

  it.each([null, 9])(
    "does not invalidate history after synchronous refresh changes session to %s",
    replacement => {
      const customer = customerFixture(7, "Changed")
      list.mockReturnValue(of(Result.success(page([customer]))))
      let reads = 0
      const a = store.observeQuery().subscribe(() => {
        if (++reads === 2) {
          const old = session.value!
          session.next(
            replacement === null
              ? null
              : AuthSession.create(old.name, old.email, null, old.expiresAt, replacement)
          )
        }
      })
      const b = store.observeQuery().subscribe()
      update.mockReturnValue(of(Result.success(customer)))
      store.updateCustomer(customer).subscribe()
      expect(invalidateHistory).not.toHaveBeenCalled()
      expect(store.entries()).toEqual({})
      expect(store.successMessage()).toBeNull()
      expect(store.writePending()).toBe(0)
      expect(list).toHaveBeenCalledTimes(2)
      a.unsubscribe()
      b.unsubscribe()
    }
  )

  it.each([
    ["page", "replacement"],
    ["page", "logout"],
    ["detail", "replacement"],
    ["detail", "logout"]
  ] as const)(
    "terminates the %s observer on %s without leaking data or pinning capacity",
    (kind, transition) => {
      let customer = customerFixture(7, "Original session")
      list.mockImplementation((query: { offset: number; limit: number }) =>
        of(Result.success(page([customer], 1000, query.offset, query.limit)))
      )
      detail.mockImplementation((id: number) => of(Result.success({ ...customer, id } as Customer)))
      const next = vi.fn(),
        complete = vi.fn()
      const oldObserver =
        kind === "page"
          ? store.observeQuery().subscribe({ next, complete })
          : store.observeCustomer(7).subscribe({ next, complete })
      const originalSession = session.value!
      const replacement = AuthSession.create(
        originalSession.name,
        originalSession.email,
        null,
        originalSession.expiresAt,
        9
      )
      session.next(transition === "logout" ? null : replacement)
      if (transition === "logout") session.next(replacement)
      customer = customerFixture(7, "Replacement session")
      if (kind === "page") store.readPage().subscribe()
      else store.readCustomer(7).subscribe()
      create.mockReturnValue(of(Result.success(customer)))
      store.createCustomer(customerInput("Replacement session")).subscribe()
      const admissionErrors: unknown[] = []
      const newObservers = Array.from({ length: 20 }, (_, index) =>
        kind === "page"
          ? store
              .observeQuery({ offset: (index + 1) * 20 })
              .subscribe({ error: error => admissionErrors.push(error) })
          : store
              .observeCustomer(index + 8)
              .subscribe({ error: error => admissionErrors.push(error) })
      )
      expect.soft(next).toHaveBeenCalledTimes(1)
      expect.soft(complete).toHaveBeenCalledTimes(1)
      expect.soft(oldObserver.closed).toBe(true)
      expect.soft(admissionErrors).toEqual([])
      newObservers.forEach(subscription => subscription.unsubscribe())
      oldObserver.unsubscribe()
    }
  )

  it("links accounts only on subscription/success and invalidates matching history once", () => {
    const customer = customerFixture(7, "Linked")
    link
      .mockReturnValueOnce(of(Result.failure(new CustomerError("FORBIDDEN"))))
      .mockReturnValueOnce(of(Result.success(customer)))
    const request = store.linkCustomerAccount({ customerId: 7, userId: 12 })
    expect(link).not.toHaveBeenCalled()
    request.subscribe()
    expect(invalidateHistory).not.toHaveBeenCalled()
    expect(store.writeError()?.code).toBe("FORBIDDEN")
    store.linkCustomerAccount({ customerId: 7, userId: null }).subscribe()
    expect(link).toHaveBeenLastCalledWith({ customerId: 7, userId: null })
    expect(link).toHaveBeenCalledTimes(2)
    expect(invalidateHistory).toHaveBeenCalledExactlyOnceWith(7)
    expect(store.successMessage()).toBe("Customer account linked successfully")
  })

  it("expires keyed details after two minutes while retaining verified data on failure", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    const customer = customerFixture(7, "Detail")
    detail.mockReturnValueOnce(of(Result.success(customer)))
    store.loadCustomer(7).subscribe()
    now.mockReturnValue(120999)
    store.loadCustomer(7).subscribe()
    expect(detail).toHaveBeenCalledTimes(1)
    now.mockReturnValue(121000)
    detail.mockReturnValue(of(Result.failure(new CustomerError("NETWORK"))))
    store.loadCustomer(7).subscribe()
    expect(detail).toHaveBeenCalledTimes(2)
    expect(store.selectedCustomer()).toBe(customer)
    expect(store.selectCustomer(7)).toMatchObject({ expires: 0, error: { code: "NETWORK" } })
    store.loadCustomer(7).subscribe()
    expect(detail).toHaveBeenCalledTimes(3)
  })

  it("bounds inactive page/detail history and pins observed and selected entries", () => {
    list.mockImplementation((q: { offset: number; limit: number }) =>
      of(Result.success(page([], 1000, q.offset, q.limit)))
    )
    detail.mockImplementation((id: number) => of(Result.success(customerFixture(id, "Bounded"))))
    const observed = store.observeQuery().subscribe()
    const selected = store.loadCustomer(7).subscribe()
    for (let i = 1; i <= 30; i++) {
      store.readPage({ offset: i * 20 }).subscribe()
      store.readCustomer(i + 10).subscribe()
    }
    expect(Object.keys(store.entries())).toHaveLength(20)
    expect(Object.keys(store.details())).toHaveLength(20)
    expect(store.selectQuery().result?.total).toBe(1000)
    expect(store.selectedCustomer()?.id).toBe(7)
    observed.unsubscribe()
    selected.unsubscribe()
  })

  it("rejects twenty-first active keys without evicting live page/detail state", () => {
    list.mockReturnValue(of(Result.success(page())))
    detail.mockImplementation((id: number) => of(Result.success(customerFixture(id, "Pinned"))))
    const subscriptions = Array.from({ length: 20 }, (_, i) => [
      store.observeQuery({ offset: i * 20 }).subscribe(),
      store.observeCustomer(i + 1).subscribe()
    ]).flat()
    let pageError: unknown, detailError: unknown
    store.observeQuery({ offset: 400 }).subscribe({ error: e => (pageError = e) })
    store.observeCustomer(21).subscribe({ error: e => (detailError = e) })
    expect(pageError).toBeInstanceOf(Error)
    expect(detailError).toBeInstanceOf(Error)
    expect(Object.keys(store.entries())).toHaveLength(20)
    expect(Object.keys(store.details())).toHaveLength(20)
    subscriptions.forEach(s => s.unsubscribe())
    store.observeQuery({ offset: 400 }).subscribe().unsubscribe()
    store.observeCustomer(21).subscribe().unsubscribe()
    expect(store.selectCustomer(21).result?.id).toBe(21)
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
