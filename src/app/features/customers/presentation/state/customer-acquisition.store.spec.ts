import { PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EMPTY, of, Subject, throwError } from "rxjs"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import {
  ACQUISITION_REPOSITORY,
  AcquisitionRepository
} from "../../domain/repositories/acquisition.repository"
import { Lead } from "../../domain/entities/lead.entity"
import { Customer, CustomerType } from "../../domain/entities/customer.entity"
import { CustomerError } from "../../domain/errors/customer.error"
import { CustomersStore } from "./customers.store"
import { CustomerAcquisitionStore } from "./customer-acquisition.store"

const lead = Lead.create(7, 1, 2, "Lead", null, null, null, null, false, new Date(0), null)
const page = { items: [lead], total: 53, offset: 5, limit: 5 }
const params = {
  originId: 1,
  stageId: 2,
  name: "Lead",
  email: null,
  phone: null,
  referenceAddress: null,
  observation: null
}

describe("CustomerAcquisitionStore", () => {
  let store: InstanceType<typeof CustomerAcquisitionStore>
  let repository: { [K in keyof AcquisitionRepository]: ReturnType<typeof vi.fn> }
  let changes: Subject<AuthSession | null>
  const auth = { session: signal<AuthSession | null>(null) }
  const customers = { invalidateCustomers: vi.fn() }
  const customerFactory = vi.fn(() => customers)
  beforeEach(() => {
    repository = {
      checkLeadEmail: vi.fn(),
      listOrigins: vi.fn(),
      createOrigin: vi.fn(),
      updateOrigin: vi.fn(),
      listStages: vi.fn(),
      createStage: vi.fn(),
      updateStage: vi.fn(),
      listLeads: vi.fn(),
      findLead: vi.fn(),
      createLead: vi.fn(),
      updateLead: vi.fn(),
      listFollowUps: vi.fn(),
      addFollowUp: vi.fn(),
      convertLead: vi.fn()
    }
    changes = new Subject()
    auth.session.set(AuthSession.create("Tester", "tester@example.test"))
    customers.invalidateCustomers.mockReset()
    customerFactory.mockClear()
    TestBed.configureTestingModule({
      providers: [
        { provide: ACQUISITION_REPOSITORY, useValue: repository },
        { provide: AuthStore, useValue: auth },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
        { provide: CustomersStore, useFactory: customerFactory }
      ]
    })
    store = TestBed.inject(CustomerAcquisitionStore)
  })
  afterEach(() => vi.restoreAllMocks())

  it("caches catalogs for 120000ms and leads/follow-ups for 30000ms at exact boundaries without polling", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    repository.listOrigins.mockReturnValue(of(Result.success([])))
    repository.listStages.mockReturnValue(of(Result.success([])))
    repository.listLeads.mockReturnValue(of(Result.success(page)))
    repository.findLead.mockReturnValue(of(Result.success(lead)))
    repository.listFollowUps.mockReturnValue(of(Result.success([])))
    const readAll = () => {
      store.loadOrigins().subscribe()
      store.loadStages().subscribe()
      store.loadLeads().subscribe()
      store.loadLead(7).subscribe()
      store.loadFollowUps(7).subscribe()
    }
    readAll()
    now.mockReturnValue(30999)
    readAll()
    expect(repository.listLeads).toHaveBeenCalledTimes(1)
    now.mockReturnValue(31000)
    expect(repository.listLeads).toHaveBeenCalledTimes(1)
    readAll()
    expect(repository.listLeads).toHaveBeenCalledTimes(2)
    expect(repository.findLead).toHaveBeenCalledTimes(2)
    expect(repository.listFollowUps).toHaveBeenCalledTimes(2)
    expect(repository.listOrigins).toHaveBeenCalledTimes(1)
    now.mockReturnValue(121000)
    readAll()
    expect(repository.listOrigins).toHaveBeenCalledTimes(2)
    expect(repository.listStages).toHaveBeenCalledTimes(2)
    expect(store.selectLeads({})().data).toEqual(page)
    expect(repository.listLeads).toHaveBeenCalledWith({ offset: 0, limit: 20 })
  })

  it("adopts returned effective pagination for revalidation without changing independent query keys", () => {
    repository.listLeads.mockReturnValue(of(Result.success(page)))
    store.loadLeads({ offset: 20, limit: 20 }).subscribe()
    expect(repository.listLeads).toHaveBeenLastCalledWith({ offset: 20, limit: 20 })
    store.loadLeads({ offset: 20, limit: 20 }, true).subscribe()
    expect(repository.listLeads).toHaveBeenLastCalledWith({ offset: 5, limit: 5 })
    expect(store.selectLeads({ offset: 20, limit: 20 })().data).toEqual(page)
    expect(store.selectLeads({ offset: 40, limit: 20 })().data).toBeUndefined()
  })

  it("keys page reads by normalized filter identity so filtered and unfiltered listings never collide", () => {
    const response = new Subject<Result<PaginationResponse<Lead>, CustomerError>>()
    repository.listLeads.mockReturnValueOnce(response)
    const a = store.loadLeads({ offset: 0, limit: 20, search: "  Ana  " }).subscribe(),
      b = store.loadLeads({ offset: 0, limit: 20, search: "Ana" }).subscribe()
    expect(repository.listLeads).toHaveBeenCalledExactlyOnceWith({
      offset: 0,
      limit: 20,
      search: "Ana"
    })
    repository.listLeads.mockReturnValueOnce(of(Result.success(page)))
    store.loadLeads({ offset: 0, limit: 20 }).subscribe()
    expect(repository.listLeads).toHaveBeenCalledTimes(2)
    response.next(Result.success({ items: [lead], total: 1, offset: 0, limit: 20 }))
    response.complete()
    a.unsubscribe()
    b.unsubscribe()
    expect(store.selectLeads({ search: "Ana" })().data?.total).toBe(1)
    expect(store.selectLeads({})().data?.total).toBe(53)
    expect(store.selectLeads({ converted: false })().data).toBeUndefined()
    repository.listLeads.mockReturnValueOnce(of(Result.success(page)))
    store.loadLeads({ originId: 11, stageId: 12, converted: false }).subscribe()
    expect(repository.listLeads).toHaveBeenLastCalledWith({
      offset: 0,
      limit: 20,
      originId: 11,
      stageId: 12,
      converted: false
    })
    expect(store.selectLeads({})().data?.total).toBe(53)
    expect(store.selectLeads({ originId: 11, stageId: 12, converted: false })().data?.total).toBe(
      53
    )
    expect(store.selectLeads({ converted: false })().data).toBeUndefined()
  })

  it("keeps active filters when a forced revalidation adopts effective server metadata", () => {
    repository.listLeads.mockReturnValueOnce(
      of(Result.success({ items: [lead], total: 53, offset: 20, limit: 5 }))
    )
    const query = { offset: 20, limit: 20, originId: 11, converted: true }
    store.loadLeads(query).subscribe()
    expect(repository.listLeads).toHaveBeenLastCalledWith({
      offset: 20,
      limit: 20,
      originId: 11,
      converted: true
    })
    store.loadLeads(query, true).subscribe()
    expect(repository.listLeads).toHaveBeenLastCalledWith({
      offset: 20,
      limit: 5,
      originId: 11,
      converted: true
    })
    expect(store.selectLeads(query)().data?.total).toBe(53)
  })

  it("expires every filtered page variant on a confirmed write without replaying reads", () => {
    repository.listLeads.mockReturnValue(of(Result.success(page)))
    store.loadLeads({ search: "Ana" }).subscribe()
    store.loadLeads({}).subscribe()
    expect(store.selectLeads({ search: "Ana" })().expires).toBeGreaterThan(0)
    repository.createLead.mockReturnValue(of(Result.success(lead)))
    store.createLead(params).subscribe()
    expect(store.selectLeads({ search: "Ana" })().expires).toBe(0)
    expect(store.selectLeads({ search: "Ana" })().data).toEqual(page)
    expect(store.selectLeads({})().data).toEqual(page)
    expect(repository.listLeads).toHaveBeenCalledTimes(2)
  })

  it("rejects a new detail read when twenty flights are pinned, then admits after cancellation", () => {
    const pending = new Subject<Result<Lead, CustomerError>>()
    repository.findLead.mockReturnValue(pending)
    const subscriptions = Array.from({ length: 20 }, (_, id) => store.loadLead(id).subscribe())
    let failure: CustomerError | undefined
    store.loadLead(21).subscribe(result => {
      if (!result.success) failure = result.error
    })
    expect(failure?.code).toBe("CONFLICT")
    expect(repository.findLead).toHaveBeenCalledTimes(20)
    subscriptions[0].unsubscribe()
    const next = store.loadLead(21).subscribe()
    expect(repository.findLead).toHaveBeenCalledTimes(21)
    next.unsubscribe()
    subscriptions.forEach(sub => sub.unsubscribe())
    expect(store.loading()).toBe(false)
  })

  it("retains same-key data and expiry on failed forced revalidation, independently from other owners and writes", () => {
    repository.findLead.mockReturnValueOnce(of(Result.success(lead)))
    store.loadLead(7).subscribe()
    const expiry = store.selectLead(7)().expires
    const pending = new Subject<Result<Lead, CustomerError>>()
    repository.findLead.mockReturnValue(pending)
    const sub = store.loadLead(7, true).subscribe()
    expect(store.selectLead(7)().refreshing).toBe(true)
    expect(store.selectLead(8)().data).toBeUndefined()
    pending.next(Result.failure(new CustomerError("NETWORK")))
    pending.complete()
    expect(store.selectLead(7)().data).toBe(lead)
    expect(store.selectLead(7)().error?.code).toBe("NETWORK")
    expect(store.selectLead(7)().expires).toBe(expiry)
    expect(store.writeError()).toBeUndefined()
    sub.unsubscribe()
  })

  it("shares refcounted flights, defers dispatch and resets pending state on final cancellation", () => {
    const response = new Subject<Result<Lead, CustomerError>>()
    repository.findLead.mockReturnValue(response)
    const read = store.loadLead(7)
    expect(repository.findLead).not.toHaveBeenCalled()
    const a = read.subscribe(),
      b = read.subscribe()
    expect(repository.findLead).toHaveBeenCalledTimes(1)
    a.unsubscribe()
    expect(response.observed).toBe(true)
    b.unsubscribe()
    expect(response.observed).toBe(false)
    expect(store.selectLead(7)().loading).toBe(false)
  })

  it("clears and fences reads/writes on session replacement but not renewal", () => {
    repository.findLead.mockReturnValue(of(Result.success(lead)))
    store.loadLead(7).subscribe()
    changes.next(AuthSession.create("Tester", "tester@example.test"))
    store.loadLead(7).subscribe()
    expect(repository.findLead).toHaveBeenCalledTimes(1)
    const write = new Subject<Result<Customer, CustomerError>>()
    repository.convertLead.mockReturnValue(write)
    store.convertLead({ leadId: 7, type: CustomerType.RESIDENTIAL }).subscribe()
    auth.session.set(null)
    changes.next(null)
    expect(write.observed).toBe(false)
    expect(store.selectLead(7)().data).toBeUndefined()
    expect(store.writing()).toBe(false)
    expect(customers.invalidateCustomers).not.toHaveBeenCalled()
    store.loadLead(7).subscribe()
    expect(repository.findLead).toHaveBeenCalledTimes(1)
  })

  it("does not dispatch SSR reads or writes or construct unrelated CustomersStore for ordinary reads", () => {
    TestBed.resetTestingModule()
    const construct = vi.fn(() => customers)
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: "server" },
        { provide: ACQUISITION_REPOSITORY, useValue: repository },
        { provide: CustomersStore, useFactory: construct }
      ]
    })
    store = TestBed.inject(CustomerAcquisitionStore)
    store.loadOrigins().subscribe()
    store.loadLead(7).subscribe()
    store.createLead(params).subscribe()
    expect(repository.listOrigins).not.toHaveBeenCalled()
    expect(repository.findLead).not.toHaveBeenCalled()
    expect(repository.createLead).not.toHaveBeenCalled()
    expect(construct).not.toHaveBeenCalled()
  })

  it("bounds inactive page/detail/follow-up history and protects in-flight entries", () => {
    const pending = new Subject<Result<Lead, CustomerError>>()
    repository.findLead.mockImplementation((id: number) =>
      id === 7 ? pending : of(Result.success({ ...lead, id }))
    )
    const sub = store.loadLead(7).subscribe()
    for (let id = 20; id < 45; id++) store.loadLead(id).subscribe()
    expect(Object.keys(store.leads()).length).toBe(20)
    expect(store.selectLead(7)().loading).toBe(true)
    sub.unsubscribe()
    repository.listLeads.mockReturnValue(of(Result.success(page)))
    repository.listFollowUps.mockReturnValue(of(Result.success([])))
    for (let id = 0; id < 25; id++) {
      store.loadLeads({ offset: id * 20 }).subscribe()
      store.loadFollowUps(id).subscribe()
    }
    expect(Object.keys(store.pages()).length).toBe(20)
    expect(Object.keys(store.followUps()).length).toBe(20)
  })

  it("maps every mutation through its use case and invalidates only affected resources without replay or invented totals", () => {
    repository.listOrigins.mockReturnValue(of(Result.success([])))
    repository.listStages.mockReturnValue(of(Result.success([])))
    repository.listLeads.mockReturnValue(of(Result.success(page)))
    repository.findLead.mockReturnValue(of(Result.success(lead)))
    repository.listFollowUps.mockReturnValue(of(Result.success([])))
    store.loadOrigins().subscribe()
    store.loadStages().subscribe()
    store.loadLeads().subscribe()
    store.loadLead(7).subscribe()
    store.loadLead(8).subscribe()
    store.loadFollowUps(7).subscribe()
    store.loadFollowUps(8).subscribe()
    const origin = { name: "Referral", description: null, isActive: true }
    const stage = { name: "New", order: 1, isFinal: false }
    repository.createOrigin.mockReturnValue(of(Result.success({ ...origin, id: 1 })))
    store.createOrigin(origin).subscribe()
    expect(repository.createOrigin).toHaveBeenCalledWith(origin)
    expect(store.origins().expires).toBe(0)
    repository.updateOrigin.mockReturnValue(of(Result.success({ ...origin, id: 1 })))
    store.updateOrigin({ ...origin, id: 1 }).subscribe()
    expect(repository.updateOrigin).toHaveBeenCalledWith({ ...origin, id: 1 })
    repository.createStage.mockReturnValue(of(Result.success({ ...stage, id: 2 })))
    store.createStage(stage).subscribe()
    expect(repository.createStage).toHaveBeenCalledWith(stage)
    repository.updateStage.mockReturnValue(of(Result.success({ ...stage, id: 2 })))
    store.updateStage({ ...stage, id: 2 }).subscribe()
    expect(repository.updateStage).toHaveBeenCalledWith({ ...stage, id: 2 })
    expect(store.stages().expires).toBe(0)
    repository.createLead.mockReturnValue(of(Result.success(lead)))
    store.createLead(params).subscribe()
    expect(repository.createLead).toHaveBeenCalledWith(params)
    repository.updateLead.mockReturnValue(of(Result.success(lead)))
    store.updateLead({ ...params, id: 7 }).subscribe()
    expect(repository.updateLead).toHaveBeenCalledWith({ ...params, id: 7 })
    expect(store.selectLeads({})().expires).toBe(0)
    expect(store.selectLeads({})().data?.total).toBe(53)
    expect(store.selectLead(7)().expires).toBe(0)
    expect(store.selectLead(8)().expires).toBeGreaterThan(0)
    const follow = { leadId: 7, stageId: 2, comment: null }
    repository.addFollowUp.mockReturnValue(of(Result.success({ ...follow, id: 1 })))
    store.addFollowUp(follow).subscribe()
    expect(repository.addFollowUp).toHaveBeenCalledWith(follow)
    expect(store.selectFollowUps(7)().expires).toBe(0)
    expect(store.selectFollowUps(8)().expires).toBeGreaterThan(0)
    expect(store.mutationRevision()).toBe(7)
  })

  it("returns the actual converted Customer and lazily invalidates customer pages/detail without stage or account writes", () => {
    const customer = Customer.create(
      61,
      "Server name",
      null,
      CustomerType.RESIDENTIAL,
      null,
      null,
      null,
      null,
      null,
      true,
      new Date(0),
      null,
      null,
      7
    )
    repository.findLead.mockReturnValue(of(Result.success(lead)))
    store.loadLead(7).subscribe()
    expect(customerFactory).not.toHaveBeenCalled()
    repository.convertLead.mockReturnValue(of(Result.success(customer)))
    const convert = { leadId: 7, type: CustomerType.RESIDENTIAL }
    let actual: Customer | undefined
    store.convertLead(convert).subscribe(result => {
      if (result.success) actual = result.data
    })
    expect(actual).toBe(customer)
    expect(repository.convertLead).toHaveBeenCalledExactlyOnceWith(convert)
    expect(customers.invalidateCustomers).toHaveBeenCalledExactlyOnceWith(61)
    expect(store.selectLead(7)().expires).toBe(0)
    // Repeated conversion remains backend-authoritative, never a local short-circuit.
    store.convertLead(convert).subscribe()
    expect(repository.convertLead).toHaveBeenCalledTimes(2)
    expect(customers.invalidateCustomers).toHaveBeenCalledTimes(2)
    expect(customerFactory).toHaveBeenCalledTimes(1)
    expect(repository.updateLead).not.toHaveBeenCalled()
    expect(repository.addFollowUp).not.toHaveBeenCalled()
  })

  it("fences older reads after success, and failures retain data and independent feedback without retrying writes", () => {
    repository.findLead.mockReturnValue(of(Result.success(lead)))
    store.loadLead(7).subscribe()
    const older = new Subject<Result<Lead, CustomerError>>()
    repository.findLead.mockReturnValue(older)
    store.loadLead(7, true).subscribe()
    repository.updateLead.mockReturnValue(of(Result.success(lead)))
    store.updateLead({ ...params, id: 7 }).subscribe()
    expect(older.observed).toBe(false)
    older.next(Result.success({ ...lead, name: "Obsolete" }))
    expect(store.selectLead(7)().data?.name).toBe("Lead")
    const error = new CustomerError("FORBIDDEN")
    repository.updateLead.mockReturnValue(of(Result.failure(error)))
    store.updateLead({ ...params, id: 7 }).subscribe()
    expect(store.writeError()).toBe(error)
    expect(store.selectLead(7)().error).toBeUndefined()
    expect(store.selectLead(7)().data).toBe(lead)
    expect(repository.updateLead).toHaveBeenCalledTimes(2)
    expect(store.mutationRevision()).toBe(1)
  })

  it("pins mounted query/detail/follow-up observers and refreshes each once after mutations, including synchronous failure", () => {
    repository.listLeads.mockReturnValue(of(Result.success(page)))
    repository.findLead.mockReturnValue(of(Result.success(lead)))
    repository.listFollowUps.mockReturnValue(of(Result.success([])))
    const a = store.observeLeads({}).subscribe(),
      b = store.observeLeads({}).subscribe()
    const c = store.observeLead(7).subscribe(),
      d = store.observeFollowUps(7).subscribe()
    for (let id = 1; id <= 25; id++) {
      store.loadLeads({ offset: id * 20 }).subscribe()
      store.loadLead(id + 20).subscribe()
      store.loadFollowUps(id + 20).subscribe()
    }
    expect(store.selectLeads({})().data).toEqual(page)
    expect(store.selectLead(7)().data).toBe(lead)
    expect(store.selectFollowUps(7)().loaded).toBe(true)
    const before = repository.listLeads.mock.calls.length
    repository.listLeads.mockReturnValue(of(Result.failure(new CustomerError("NETWORK"))))
    repository.addFollowUp.mockReturnValue(of(Result.success({ id: 1, leadId: 7 })))
    store.addFollowUp({ leadId: 7, stageId: 2, comment: null }).subscribe()
    expect(repository.listLeads).toHaveBeenCalledTimes(before + 1)
    expect(store.selectLeads({})().data).toEqual(page)
    expect(store.selectLeads({})().error?.code).toBe("NETWORK")
    expect(repository.findLead).toHaveBeenLastCalledWith(7)
    expect(repository.listFollowUps).toHaveBeenLastCalledWith(7)
    a.unsubscribe()
    b.unsubscribe()
    c.unsubscribe()
    d.unsubscribe()
    const after = repository.listLeads.mock.calls.length
    store.addFollowUp({ leadId: 7, stageId: 2, comment: null }).subscribe()
    expect(repository.listLeads).toHaveBeenCalledTimes(after)
  })

  it("rejects admission rather than evicting twenty active query views", () => {
    repository.listLeads.mockReturnValue(of(Result.success(page)))
    const subscriptions = Array.from({ length: 20 }, (_, i) =>
      store.observeLeads({ offset: i * 20 }).subscribe()
    )
    let failure: CustomerError | undefined
    store.loadLeads({ offset: 400 }).subscribe(result => {
      if (!result.success) failure = result.error
    })
    expect(failure?.code).toBe("CONFLICT")
    expect(repository.listLeads).toHaveBeenCalledTimes(20)
    subscriptions.forEach(sub => sub.unsubscribe())
    store.loadLeads({ offset: 400 }).subscribe()
    expect(repository.listLeads).toHaveBeenCalledTimes(21)
  })

  it("fences conversion coherence and revision if a consumer logs out synchronously during mutation refresh", () => {
    repository.listLeads.mockReturnValue(of(Result.success(page)))
    let logoutOnRefresh = false
    const observer = store.observeLeads().subscribe(() => {
      if (logoutOnRefresh) {
        auth.session.set(null)
        changes.next(null)
      }
    })
    const customer = Customer.create(
      61,
      "Server name",
      null,
      CustomerType.RESIDENTIAL,
      null,
      null,
      null,
      null,
      null,
      true,
      new Date(0),
      null,
      null,
      7
    )
    repository.convertLead.mockReturnValue(of(Result.success(customer)))
    logoutOnRefresh = true
    const received = vi.fn()
    store.convertLead({ leadId: 7, type: CustomerType.RESIDENTIAL }).subscribe(received)
    expect(customers.invalidateCustomers).not.toHaveBeenCalled()
    expect(store.mutationRevision()).toBe(0)
    expect(received).not.toHaveBeenCalled()
    expect(store.writing()).toBe(false)
    observer.unsubscribe()
  })

  it("normalizes thrown errors and empty completions and settles cancellation", () => {
    repository.findLead.mockReturnValue(EMPTY)
    store.loadLead(7).subscribe()
    expect(store.selectLead(7)().error?.code).toBe("INVALID_RESPONSE")
    repository.createLead.mockReturnValue(throwError(() => new Error("unsafe")))
    store.createLead(params).subscribe()
    expect(store.writeError()?.code).toBe("UNEXPECTED")
    expect(store.writing()).toBe(false)
    const pending = new Subject<Result<Lead, CustomerError>>()
    repository.createLead.mockReturnValue(pending)
    const sub = store.createLead(params).subscribe()
    expect(store.writing()).toBe(true)
    sub.unsubscribe()
    expect(store.writing()).toBe(false)
  })
})
