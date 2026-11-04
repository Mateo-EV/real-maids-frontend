import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, EMPTY, firstValueFrom, of, Subject, throwError, Observable } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { FieldStaffSummary } from "../../domain/models/field-staff-summary"
import { FieldOperationsError } from "../../domain/errors/field-operations.error"
import {
  GetFieldStaffUseCase,
  GetFieldStaffByIdUseCase,
  GetMyStaffProfileUseCase
} from "../../application/use-cases/field-staff.use-cases"
import { FieldStaffStore } from "./field-staff.store"

const staff = (id = 7): FieldStaffSummary => ({
  id,
  name: "Staff",
  document: "DOC",
  phone: null,
  email: null,
  language: "es",
  joinedOn: null,
  isActive: true,
  userId: 19,
  availability: [],
  createdAt: new Date("2026-01-01T00:00:00Z")
})
const page = (total = 1, offset = 0, limit = 20): PaginationResponse<FieldStaffSummary> => ({
  items: total > offset ? [staff()] : [],
  total,
  offset,
  limit
})
type PageResult = Result<PaginationResponse<FieldStaffSummary>, FieldOperationsError>
type ProfileResult = Result<FieldStaffSummary, FieldOperationsError>
const denied = () => Result.failure(new FieldOperationsError("FORBIDDEN", "Safe"))

describe("FieldStaffStore consumer-owned presentation reads", () => {
  let store: InstanceType<typeof FieldStaffStore>, session: BehaviorSubject<AuthSession | null>
  let list: ReturnType<typeof vi.fn>, detail: ReturnType<typeof vi.fn>, me: ReturnType<typeof vi.fn>
  beforeEach(() => {
    session = new BehaviorSubject<AuthSession | null>(
      AuthSession.create("Caller", "caller@example.test", null, null, 19)
    )
    list = vi.fn(() => of(Result.success(page())))
    detail = vi.fn(() => of(Result.success(staff())))
    me = vi.fn(() => of(Result.success(staff())))
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { session: () => session.value } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
        { provide: GetFieldStaffUseCase, useValue: { execute: list } },
        { provide: GetFieldStaffByIdUseCase, useValue: { execute: detail } },
        { provide: GetMyStaffProfileUseCase, useValue: { execute: me } }
      ]
    })
    store = TestBed.inject(FieldStaffStore)
  })
  afterEach(() => vi.restoreAllMocks())

  it("keeps selection pure, normalizes complete keys and snapshots consumer queries", () => {
    expect(store.selectStaff().result).toBeUndefined()
    expect(store.selectStaffById(7).result).toBeUndefined()
    expect(store.selectMyStaffProfile().result).toBeUndefined()
    expect(list).not.toHaveBeenCalled()
    const q = { search: "  Doc  ", isActive: false, offset: 20, limit: 10 }
    const pending = store.readStaff(q)
    q.search = "Changed"
    pending.subscribe()
    expect(list).toHaveBeenCalledExactlyOnceWith({
      search: "Doc",
      isActive: false,
      offset: 20,
      limit: 10
    })
    expect(
      store.selectStaff({ search: "Doc", isActive: false, offset: 20, limit: 10 }).result
    ).toBeDefined()
    expect(
      store.selectStaff({ search: "Doc", isActive: true, offset: 20, limit: 10 }).result
    ).toBeUndefined()
    expect(
      store.selectStaff({ search: "Other", isActive: false, offset: 20, limit: 10 }).result
    ).toBeUndefined()
  })
  it("shares equivalent query reads and cancellation only releases the caller's subscription", () => {
    const flight = new Subject<PageResult>()
    list.mockReturnValue(flight)
    const a = store.observeStaff({ search: " Doc ", isActive: false }).subscribe(),
      b = store.observeStaff({ search: "Doc", isActive: false }).subscribe()
    expect(list).toHaveBeenCalledTimes(1)
    expect(store.selectStaff({ search: "Doc", isActive: false }).loading).toBe(true)
    a.unsubscribe()
    expect(flight.observed).toBe(true)
    b.unsubscribe()
    expect(flight.observed).toBe(false)
    expect(store.selectStaff({ search: "Doc", isActive: false }).loading).toBe(false)
    expect(store.selectStaff({ search: "Doc", isActive: false }).result).toBeUndefined()
  })
  it("keeps different queries independent and retains exact server effective metadata, zero and out-of-range results", () => {
    const first = new Subject<PageResult>(),
      second = new Subject<PageResult>()
    list.mockReturnValueOnce(first).mockReturnValueOnce(second)
    store.readStaff({ offset: 40 }).subscribe()
    store.readStaff({ search: "none" }).subscribe()
    second.next(Result.success(page(0)))
    second.complete()
    first.next(Result.success(page(1, 10, 5)))
    first.complete()
    expect(store.selectStaff({ offset: 40 }).result).toEqual(page(1, 10, 5))
    expect(store.selectStaff({ search: "none" }).result?.total).toBe(0)
    expect(store.selectStaff({ offset: 20 }).result).toBeUndefined()
    expect(list).toHaveBeenCalledTimes(2)
  })
  it.each(["page", "detail", "me"])("uses a success-only 120000ms boundary for %s", kind => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    const read = () =>
      kind === "page"
        ? store.readStaff().subscribe()
        : kind === "detail"
          ? store.readStaffById(7).subscribe()
          : store.readMyStaffProfile().subscribe()
    const request = kind === "page" ? list : kind === "detail" ? detail : me
    read()
    now.mockReturnValue(120999)
    read()
    expect(request).toHaveBeenCalledTimes(1)
    now.mockReturnValue(121000)
    read()
    expect(request).toHaveBeenCalledTimes(2)
  })
  it("preserves verified same-query rows through expiry, refreshing, failure and explicit force retry", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    store.readStaff().subscribe()
    const value = store.selectStaff().result
    const flight = new Subject<PageResult>()
    list.mockReturnValue(flight)
    now.mockReturnValue(121000)
    const observation = store.observeStaff().subscribe()
    expect(store.selectStaff()).toMatchObject({ result: value, loading: false, refreshing: true })
    flight.next(denied())
    flight.complete()
    expect(store.selectStaff()).toMatchObject({
      result: value,
      loading: false,
      refreshing: false,
      error: { code: "FORBIDDEN" }
    })
    expect(store.selectStaff().expires).toBeLessThanOrEqual(121000)
    list.mockReturnValue(of(Result.success(page(0))))
    store.readStaff({}, true).subscribe()
    expect(store.selectStaff()).toMatchObject({
      result: page(0),
      expires: 241000,
      error: undefined
    })
    observation.unsubscribe()
  })
  it("does not renew TTL after failed forced revalidation of a fresh profile", () => {
    vi.spyOn(Date, "now").mockReturnValue(1000)
    store.readStaffById(7).subscribe()
    detail.mockReturnValue(of(denied()))
    store.readStaffById(7, true).subscribe()
    expect(store.selectStaffById(7)).toMatchObject({
      result: staff(),
      error: { code: "FORBIDDEN" },
      expires: 0
    })
    detail.mockReturnValue(of(Result.success(staff())))
    store.readStaffById(7).subscribe()
    expect(detail).toHaveBeenCalledTimes(3)
  })
  it.each(["detail", "me"])(
    "preserves same-owner %s data and retryable stale errors during revalidation",
    kind => {
      const request = kind === "detail" ? detail : me
      const read = (force = false) =>
        kind === "detail" ? store.readStaffById(7, force) : store.readMyStaffProfile(force)
      const select = () =>
        kind === "detail" ? store.selectStaffById(7) : store.selectMyStaffProfile()
      read().subscribe()
      const flight = new Subject<ProfileResult>()
      request.mockReturnValue(flight)
      const subscription = read(true).subscribe()
      expect(select()).toMatchObject({ result: staff(), refreshing: true, loading: false })
      flight.next(denied())
      flight.complete()
      expect(select()).toMatchObject({
        result: staff(),
        refreshing: false,
        error: { code: "FORBIDDEN" }
      })
      subscription.unsubscribe()
    }
  )
  it("keeps detail IDs and me independent, shares same-ID flights and joins forced retry", () => {
    const own = new Subject<ProfileResult>(),
      selected = new Subject<ProfileResult>()
    me.mockReturnValue(own)
    detail.mockReturnValue(selected)
    const a = store.observeStaffById(7).subscribe(),
      b = store.readStaffById(7, true).subscribe(),
      c = store.observeMyStaffProfile().subscribe()
    expect(detail).toHaveBeenCalledTimes(1)
    a.unsubscribe()
    expect(selected.observed).toBe(true)
    selected.next(Result.success(staff()))
    selected.complete()
    b.unsubscribe()
    expect(store.selectStaffById(7).result?.id).toBe(7)
    expect(store.selectStaffById(19).result).toBeUndefined()
    expect(store.selectMyStaffProfile().result).toBeUndefined()
    own.next(Result.success(staff(22)))
    own.complete()
    expect(store.selectMyStaffProfile().result?.id).toBe(22)
    c.unsubscribe()
  })
  it("revisits successful reads without polling and force bypasses freshness", () => {
    const a = store.observeStaff().subscribe()
    a.unsubscribe()
    const b = store.observeStaff().subscribe()
    b.unsubscribe()
    expect(list).toHaveBeenCalledTimes(1)
    const c = store.observeStaff({}, true).subscribe()
    c.unsubscribe()
    expect(list).toHaveBeenCalledTimes(2)
  })
  it.each(["logout", "replace"])(
    "clears and cancels all entry types on %s, fencing late completions",
    action => {
      store.readStaff().subscribe()
      store.readStaffById(7).subscribe()
      store.readMyStaffProfile().subscribe()
      const pages = new Subject<PageResult>(),
        details = new Subject<ProfileResult>(),
        own = new Subject<ProfileResult>()
      list.mockReturnValue(pages)
      detail.mockReturnValue(details)
      me.mockReturnValue(own)
      let deliveries = 0
      const a = store.observeStaff({}, true).subscribe(() => deliveries++),
        b = store.observeStaffById(7, true).subscribe(() => deliveries++),
        c = store.observeMyStaffProfile(true).subscribe(() => deliveries++)
      session.next(
        action === "logout"
          ? null
          : AuthSession.create("Other", "other@example.test", null, null, 20)
      )
      expect([a.closed, b.closed, c.closed]).toEqual([true, true, true])
      expect([pages.observed, details.observed, own.observed]).toEqual([false, false, false])
      pages.next(Result.success(page()))
      details.next(denied())
      own.next(Result.success(staff(99)))
      expect(deliveries).toBe(0)
      expect(store.selectStaff().result).toBeUndefined()
      expect(store.selectStaffById(7).result).toBeUndefined()
      expect(store.selectMyStaffProfile().result).toBeUndefined()
    }
  )
  it("preserves reads and data on same-session renewal, not fixed-deadline replacement", () => {
    store.readStaff().subscribe()
    const own = new Subject<ProfileResult>()
    me.mockReturnValue(own)
    const observation = store.observeMyStaffProfile().subscribe()
    session.next(AuthSession.create("Renewed label", "caller@example.test", null, null, 19))
    expect(own.observed).toBe(true)
    store.readStaff().subscribe()
    expect(list).toHaveBeenCalledTimes(1)
    session.next(AuthSession.create("Caller", "caller@example.test", null, Date.now() + 60000, 19))
    expect(observation.closed).toBe(true)
    expect(store.selectStaff().result).toBeUndefined()
  })
  it("fails closed at session expiry without dispatching or retaining old data", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    session.next(AuthSession.create("Caller", "caller@example.test", null, 2000, 19))
    store.readStaff().subscribe()
    now.mockReturnValue(2000)
    expect(await firstValueFrom(store.readStaff())).toMatchObject({
      success: false,
      error: { code: "UNAUTHENTICATED" }
    })
    expect(list).toHaveBeenCalledTimes(1)
    expect(store.selectStaff().result).toBeUndefined()
  })
  it("bounds inactive query/detail history while pinning observed entries", () => {
    const activePage = store.observeStaff({ search: "pinned" }).subscribe(),
      activeDetail = store.observeStaffById(7).subscribe()
    for (let i = 0; i < 25; i++) {
      store.readStaff({ search: `q${i}` }).subscribe()
      store.readStaffById(100 + i).subscribe()
    }
    expect(store.selectStaff({ search: "pinned" }).result).toBeDefined()
    expect(store.selectStaffById(7).result).toBeDefined()
    expect(store.selectStaff({ search: "q0" }).result).toBeUndefined()
    expect(store.selectStaffById(100).result).toBeUndefined()
    expect(store.selectStaff({ search: "q24" }).result).toBeDefined()
    activePage.unsubscribe()
    activeDetail.unsubscribe()
  })
  it("rejects excess concurrent admission without evicting active views", async () => {
    const observations = Array.from({ length: 20 }, (_, i) =>
      store.observeStaff({ search: `q${i}` }).subscribe()
    )
    expect(await firstValueFrom(store.readStaff({ search: "excess" }))).toMatchObject({
      success: false,
      error: { code: "UNAVAILABLE" }
    })
    expect(list).toHaveBeenCalledTimes(20)
    expect(store.selectStaff({ search: "q0" }).result).toBeDefined()
    observations.forEach(s => s.unsubscribe())
    store.readStaff({ search: "excess" }).subscribe()
    expect(list).toHaveBeenCalledTimes(21)
  })
  it("settles empty and thrown request failures without inventing verified data", () => {
    list.mockReturnValue(EMPTY)
    me.mockReturnValue(throwError(() => new Error("private")))
    store.readStaff().subscribe()
    store.readMyStaffProfile().subscribe()
    expect(store.selectStaff()).toMatchObject({
      result: undefined,
      loading: false,
      error: { code: "INVALID_RESPONSE" }
    })
    expect(store.selectMyStaffProfile()).toMatchObject({
      result: undefined,
      loading: false,
      error: { code: "UNKNOWN" }
    })
    expect(store.selectMyStaffProfile().error?.message).not.toContain("private")
  })
  it("cancels owned observations when the root injector is destroyed", () => {
    const flight = new Subject<PageResult>()
    list.mockReturnValue(flight)
    const observation = store.observeStaff().subscribe()
    TestBed.resetTestingModule()
    expect(flight.observed).toBe(false)
    expect(observation.closed).toBe(true)
  })
})

describe("FieldStaffStore SSR", () => {
  it("does not resolve auth or dispatch any use case in SSR", async () => {
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: "server" }] })
    const store = TestBed.inject(FieldStaffStore)
    for (const read of [store.readStaff(), store.readStaffById(7), store.readMyStaffProfile()]) {
      expect(await firstValueFrom<unknown>(read)).toMatchObject({
        success: false,
        error: { code: "UNAUTHENTICATED" }
      })
    }
    const observations: Observable<unknown>[] = [
      store.observeStaff(),
      store.observeStaffById(7),
      store.observeMyStaffProfile()
    ]
    for (const observe of observations) {
      let complete = false
      observe.subscribe({ complete: () => (complete = true) })
      expect(complete).toBe(true)
    }
  })
})
