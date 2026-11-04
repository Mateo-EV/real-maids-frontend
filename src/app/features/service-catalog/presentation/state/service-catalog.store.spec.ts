import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Observable, of, Subject } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { Result } from "@/app/shared/utils/result"
import { ListActiveServiceTypesUseCase } from "../../application/use-cases/list-active-service-types.use-case"
import { ServiceCatalogError } from "../../domain/errors/service-catalog.error"
import { ServiceTypeSummary } from "../../domain/models/service-type-summary"
import { ServiceCatalogStore } from "./service-catalog.store"

const data: ServiceTypeSummary[] = [
  {
    id: 9,
    name: "Fixture",
    description: null,
    estimatedDurationMinutes: 60,
    categoryId: 3,
    categoryName: "Hogar"
  }
]
type Response = Result<ServiceTypeSummary[], ServiceCatalogError>
describe("ServiceCatalogStore public read lifecycle", () => {
  let session: BehaviorSubject<AuthSession | null>
  let read: ReturnType<typeof vi.fn<() => Observable<Response>>>
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(1000)
    session = new BehaviorSubject<AuthSession | null>(
      AuthSession.create("Fixture", "fixture@example.test", null, 9999999, 7)
    )
    read = vi.fn(() => of(Result.success(data)))
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthStore, useValue: { session: () => session.value } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
        { provide: ListActiveServiceTypesUseCase, useValue: { execute: read } }
      ]
    })
  })
  afterEach(() => vi.restoreAllMocks())
  it("is lazy, reuses success until exactly 120000ms and forces explicit retries", () => {
    const store = TestBed.inject(ServiceCatalogStore)
    const lazy = store.loadActiveServiceTypes()
    expect(read).not.toHaveBeenCalled()
    lazy.subscribe()
    expect(store.selectActiveServiceTypes()).toMatchObject({ loaded: true, data, expires: 121000 })
    vi.mocked(Date.now).mockReturnValue(120999)
    store.loadActiveServiceTypes().subscribe()
    expect(read).toHaveBeenCalledTimes(1)
    vi.mocked(Date.now).mockReturnValue(121000)
    store.loadActiveServiceTypes().subscribe()
    expect(read).toHaveBeenCalledTimes(2)
    store.loadActiveServiceTypes(true).subscribe()
    expect(read).toHaveBeenCalledTimes(3)
  })
  it("preserves verified stale rows during refresh/error, failures never renew freshness", () => {
    const store = TestBed.inject(ServiceCatalogStore)
    store.loadActiveServiceTypes().subscribe()
    vi.mocked(Date.now).mockReturnValue(121000)
    const pending = new Subject<Response>()
    read.mockReturnValueOnce(pending)
    store.loadActiveServiceTypes().subscribe()
    expect(store.selectActiveServiceTypes()).toMatchObject({ loaded: true, data, refreshing: true })
    expect(store.loading()).toBe(true)
    pending.next(Result.failure(new ServiceCatalogError("FORBIDDEN", "Seguro")))
    pending.complete()
    expect(store.selectActiveServiceTypes()).toMatchObject({
      data,
      loaded: true,
      refreshing: false,
      expires: 121000,
      error: { code: "FORBIDDEN" }
    })
    store.loadActiveServiceTypes().subscribe()
    expect(read).toHaveBeenCalledTimes(3)
    expect(store.selectActiveServiceTypes().error).toBeUndefined()
  })
  it("keeps failed initial reads unverified and caches a verified empty result", () => {
    const store = TestBed.inject(ServiceCatalogStore)
    read.mockReturnValueOnce(of(Result.failure(new ServiceCatalogError("UNAVAILABLE", "Seguro"))))
    store.loadActiveServiceTypes().subscribe()
    expect(store.selectActiveServiceTypes()).toMatchObject({ loaded: false, expires: 0 })
    read.mockReturnValueOnce(of(Result.success([])))
    store.loadActiveServiceTypes().subscribe()
    store.loadActiveServiceTypes().subscribe()
    expect(read).toHaveBeenCalledTimes(2)
    expect(store.selectActiveServiceTypes()).toMatchObject({ data: [], loaded: true })
  })
  it("shares forced/in-flight reads and aborts only when the final consumer leaves", () => {
    const store = TestBed.inject(ServiceCatalogStore)
    const abort = vi.fn()
    read.mockReturnValue(new Observable<Response>(() => abort))
    const a = store.loadActiveServiceTypes().subscribe()
    const b = store.loadActiveServiceTypes(true).subscribe()
    expect(read).toHaveBeenCalledTimes(1)
    a.unsubscribe()
    expect(abort).not.toHaveBeenCalled()
    expect(store.loading()).toBe(true)
    b.unsubscribe()
    expect(abort).toHaveBeenCalledTimes(1)
    expect(store.loading()).toBe(false)
    store.loadActiveServiceTypes().subscribe().unsubscribe()
    expect(read).toHaveBeenCalledTimes(2)
  })
  it.each(["logout", "replacement", "expiry"])(
    "clears and fences cached/pending data on %s",
    transition => {
      const store = TestBed.inject(ServiceCatalogStore)
      store.loadActiveServiceTypes().subscribe()
      const pending = new Subject<Response>()
      read.mockReturnValueOnce(pending)
      const delivered = vi.fn()
      store.loadActiveServiceTypes(true).subscribe(delivered)
      session.next(
        transition === "logout"
          ? null
          : AuthSession.create(
              "Fixture",
              "fixture@example.test",
              null,
              transition === "expiry" ? 500 : 9999999,
              transition === "replacement" ? 8 : 7
            )
      )
      expect(store.selectActiveServiceTypes()).toMatchObject({
        loaded: false,
        data: [],
        expires: 0
      })
      expect(pending.observed).toBe(false)
      pending.next(Result.success(data))
      expect(delivered).not.toHaveBeenCalled()
      expect(store.selectActiveServiceTypes().loaded).toBe(false)
      store.loadActiveServiceTypes().subscribe()
      expect(read).toHaveBeenCalledTimes(transition === "replacement" ? 3 : 2)
    }
  )
  it("detects elapsed session expiry on the next read even without a source emission", () => {
    const store = TestBed.inject(ServiceCatalogStore)
    store.loadActiveServiceTypes().subscribe()
    vi.mocked(Date.now).mockReturnValue(9999999)
    store.loadActiveServiceTypes().subscribe()
    expect(read).toHaveBeenCalledTimes(1)
    expect(store.selectActiveServiceTypes().loaded).toBe(false)
  })
  it("preserves cache and in-flight work for same-session renewal", () => {
    const store = TestBed.inject(ServiceCatalogStore)
    store.loadActiveServiceTypes().subscribe()
    const pending = new Subject<Response>()
    read.mockReturnValueOnce(pending)
    store.loadActiveServiceTypes(true).subscribe()
    session.next(AuthSession.create("Fixture", "fixture@example.test", null, 9999999, 7))
    expect(pending.observed).toBe(true)
    expect(store.selectActiveServiceTypes().data).toEqual(data)
    pending.next(Result.success([]))
    pending.complete()
    store.loadActiveServiceTypes().subscribe()
    expect(read).toHaveBeenCalledTimes(2)
    expect(store.selectActiveServiceTypes()).toMatchObject({ loaded: true, data: [] })
  })
  it("settles thrown reads as typed safe errors", () => {
    read.mockImplementationOnce(() => {
      throw new Error("Private detail")
    })
    const store = TestBed.inject(ServiceCatalogStore)
    store.loadActiveServiceTypes().subscribe()
    expect(store.selectActiveServiceTypes()).toMatchObject({
      loaded: false,
      error: { code: "UNKNOWN" },
      pendingReads: 0
    })
    expect(store.selectActiveServiceTypes().error?.message).not.toContain("Private")
  })
  it("dispatches neither reads nor auth initialization in SSR", () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    const store = TestBed.inject(ServiceCatalogStore)
    store.loadActiveServiceTypes().subscribe()
    store.loadActiveServiceTypes(true).subscribe()
    expect(read).not.toHaveBeenCalled()
    expect(store.selectActiveServiceTypes().loaded).toBe(false)
  })
})
