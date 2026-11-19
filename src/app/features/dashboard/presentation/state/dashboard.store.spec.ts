import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, firstValueFrom, Observable, Subscription } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { Result } from "@/app/shared/utils/result"
import { GetDashboardUseCase } from "../../application/use-cases/get-dashboard.use-case"
import { provideDashboardReads } from "../../dashboard.providers"
import { DashboardError } from "../../domain/errors/dashboard.error"
import { DashboardView } from "../../domain/models/dashboard-views"
import { DashboardParams } from "../../domain/params/dashboard.params"
import { DashboardStore } from "./dashboard.store"

const endpoint = "https://api.example.test/api/dashboard"
const deadline = 4102444800000
const caller = (id = 19, expires = deadline) =>
  AuthSession.create("Caller", `caller${id}@example.test`, null, expires, id)

const wire = () => ({
  generadoEn: "2026-02-11T09:15:00-05:00",
  actual: {
    ordenesPorEstado: { PENDIENTE: 2 },
    serviciosHoy: 6,
    serviciosProximos7Dias: 21,
    ordenesSinProgramar: 4,
    solicitudesPorAtender: 3,
    atencionesAbiertas: 1,
    serviciosPorDia: [{ fecha: "2026-02-11", servicios: 6 }],
    cargaProximos7Dias: [{ idPersonal: 7, nombre: "Ana Torres", servicios: 11, horas: 38.5 }]
  },
  periodo: {
    desde: "2026-01-12",
    hasta: "2026-02-11",
    solicitudesRegistradas: 24,
    ordenesCreadas: 19,
    ordenesCompletadas: 17,
    ordenesCanceladas: 2,
    tasaCumplimiento: 89.47,
    montoCompletado: 12500.5,
    quejas: 1
  }
})

/** A window with no activity: verified zeros, not "no data". */
const zeroWire = () => ({
  generadoEn: "2026-02-11T09:15:00-05:00",
  actual: {
    ordenesPorEstado: {},
    serviciosHoy: 0,
    serviciosProximos7Dias: 0,
    ordenesSinProgramar: 0,
    solicitudesPorAtender: 0,
    atencionesAbiertas: 0,
    serviciosPorDia: [],
    cargaProximos7Dias: []
  },
  periodo: {
    desde: "2026-01-12",
    hasta: "2026-02-11",
    solicitudesRegistradas: 0,
    ordenesCreadas: 0,
    ordenesCompletadas: 0,
    ordenesCanceladas: 0,
    tasaCumplimiento: null,
    montoCompletado: 0,
    quejas: 0
  }
})

const view = (): DashboardView => ({
  generatedAt: new Date("2026-02-11T14:15:00Z"),
  current: {
    ordersByState: { PENDIENTE: 2 },
    servicesToday: 6,
    servicesNext7Days: 21,
    unscheduledOrders: 4,
    requestsPending: 3,
    openSupportRequests: 1,
    servicesPerDay: [{ date: "2026-02-11", services: 6 }],
    next7DaysLoad: [{ staffId: 7, name: "Ana Torres", services: 11, hours: "38.5" }]
  },
  period: {
    fromDate: "2026-01-12",
    toDate: "2026-02-11",
    requestsRegistered: 24,
    ordersCreated: 19,
    ordersCompleted: 17,
    ordersCancelled: 2,
    complianceRate: "89.47",
    completedAmount: "12500.5",
    complaints: 1
  }
})

/** Caller-owned controlled read, used where a genuine late completion must be faked. */
class ControlledDashboard {
  readonly calls: {
    params: DashboardParams
    cancelled: boolean
    succeed(next: DashboardView): void
    fail(error: DashboardError): void
  }[] = []

  latest() {
    return this.calls[this.calls.length - 1]
  }

  execute(params: DashboardParams = {}): Observable<Result<DashboardView, DashboardError>> {
    return new Observable<Result<DashboardView, DashboardError>>(subscriber => {
      let settled = false
      const call = {
        params,
        cancelled: false,
        succeed: (next: DashboardView) => {
          settled = true
          subscriber.next(Result.success(next))
          subscriber.complete()
        },
        fail: (error: DashboardError) => {
          settled = true
          subscriber.next(Result.failure(error))
          subscriber.complete()
        }
      }
      this.calls.push(call)
      return () => {
        if (!settled) call.cancelled = true
      }
    })
  }
}

describe("W3 root DashboardStore / D2,S6,S8,S9", () => {
  let http: HttpTestingController
  let sessions: BehaviorSubject<AuthSession | null>
  let authFactory: ReturnType<typeof vi.fn>
  let reads: ControlledDashboard | undefined
  let store: InstanceType<typeof DashboardStore>
  let subscriptions: Subscription[]

  const given = (
    platform: "browser" | "server" = "browser",
    session: AuthSession | null = caller()
  ) => {
    TestBed.resetTestingModule()
    sessions = new BehaviorSubject<AuthSession | null>(session)
    authFactory = vi.fn(() => ({ session: () => sessions.value }))
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: API_URL, useValue: "https://api.example.test" },
        { provide: AuthStore, useFactory: authFactory },
        {
          provide: ObserveAuthSessionUseCase,
          useValue: { execute: () => sessions.asObservable() }
        },
        ...(reads
          ? [
              {
                provide: GetDashboardUseCase,
                useValue: { execute: (input: DashboardParams) => reads!.execute(input) }
              }
            ]
          : [provideDashboardReads()])
      ]
    })
    http = TestBed.inject(HttpTestingController)
    store = TestBed.inject(DashboardStore)
  }

  const observe = (params: DashboardParams = {}, force = false) => {
    const subscription = store.observe(params, force).subscribe()
    subscriptions.push(subscription)
    return subscription
  }
  const pending = () => http.expectOne(candidate => candidate.url === endpoint)

  beforeEach(() => {
    reads = undefined
    subscriptions = []
    given()
  })

  afterEach(() => {
    subscriptions.forEach(subscription => subscription.unsubscribe())
    try {
      http.verify()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it("reads exactly once on entry and records when the result was verified", async () => {
    expect(store.result()).toBeUndefined()
    expect(store.loading()).toBe(false)

    const results: Result<DashboardView, DashboardError>[] = []
    store.observe({}).subscribe(result => results.push(result))
    expect(store.loading()).toBe(true)
    expect(store.refreshing()).toBe(false)

    const request = pending()
    expect(request.request.params.keys()).toEqual([])
    request.flush(wire())

    expect(results).toHaveLength(1)
    expect(store.loading()).toBe(false)
    expect(store.refreshing()).toBe(false)
    expect(store.error()).toBeUndefined()
    expect(store.result()?.current.servicesToday).toBe(6)
    expect(store.verifiedAt()).toEqual(expect.any(Number))
    // One entry, one read: nothing is served from a previous visit and nothing polls.
    http.expectNone(() => true)
  })

  it("re-reads exactly once on an explicit refresh, keeping the verified result visible", async () => {
    observe()
    pending().flush(wire())
    const verifiedAt = store.verifiedAt()

    observe({}, true)
    expect(store.refreshing()).toBe(true)
    expect(store.loading()).toBe(false)
    expect(store.result()?.current.servicesToday).toBe(6)

    const refresh = pending()
    expect(refresh.request.params.keys()).toEqual([])
    refresh.flush(zeroWire())

    expect(store.refreshing()).toBe(false)
    expect(store.result()?.current.servicesToday).toBe(0)
    expect(store.verifiedAt()).toEqual(expect.any(Number))
    expect(store.verifiedAt()!).toBeGreaterThanOrEqual(verifiedAt!)
    http.expectNone(() => true)
  })

  it("keeps a verified zero through a failed revalidation and never replays the read", async () => {
    observe()
    pending().flush(zeroWire())
    const verified = store.result()
    const verifiedAt = store.verifiedAt()
    expect(verified?.current.servicesToday).toBe(0)

    observe({}, true)
    pending().flush({ message: "denied" }, { status: 403, statusText: "Forbidden" })

    // The verified zero survives: it is not blanked into "no data".
    expect(store.result()).toBe(verified)
    expect(store.verifiedAt()).toBe(verifiedAt)
    expect(store.error()?.code).toBe("FORBIDDEN")
    expect(store.loading()).toBe(false)
    expect(store.refreshing()).toBe(false)
    http.expectNone(() => true)
  })

  it("supersedes a pending read on an explicit refresh and ignores its late completion", () => {
    observe()
    const pendingRead = pending()

    observe({}, true)
    const refreshed = pending()
    // A superseded read is detached, not cancelled: its own observer keeps its answer.
    expect(pendingRead.cancelled).toBe(false)
    // Nothing is verified yet in this window, so the superseding read is still a load.
    expect(store.loading()).toBe(true)
    expect(store.refreshing()).toBe(false)

    refreshed.flush(wire())
    expect(store.result()?.current.servicesToday).toBe(6)
    pendingRead.flush(zeroWire())
    expect(store.result()?.current.servicesToday).toBe(6)
    expect(store.refreshing()).toBe(false)
    http.expectNone(() => true)
  })

  it("shares one in-flight read between two observers", () => {
    const first: Result<DashboardView, DashboardError>[] = []
    const second: Result<DashboardView, DashboardError>[] = []
    store.observe({}).subscribe(result => first.push(result))
    store.observe({}).subscribe(result => second.push(result))

    const shared = pending()
    shared.flush(wire())

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(second[0]).toBe(first[0])
    http.expectNone(() => true)
  })

  it("releases the read when the last observer unsubscribes", () => {
    const first = observe()
    const request = pending()
    const second = observe()
    second.unsubscribe()
    expect(request.cancelled).toBe(false)

    first.unsubscribe()
    expect(request.cancelled).toBe(true)
    expect(store.loading()).toBe(false)
    expect(store.refreshing()).toBe(false)
    expect(store.result()).toBeUndefined()
  })

  it("dispatches nothing on the server or without an unexpired credential", () => {
    given("server")
    const server: unknown[] = []
    store.observe({}).subscribe(result => server.push(result))
    expect(server).toEqual([])
    // Even the lazy auth acquisition stays untouched during rendering.
    expect(authFactory).not.toHaveBeenCalled()
    http.expectNone(() => true)

    given("browser", null)
    const anonymous: unknown[] = []
    store.observe({}).subscribe(result => anonymous.push(result))
    expect(anonymous).toEqual([])
    expect(store.result()).toBeUndefined()
    http.expectNone(() => true)

    given("browser", caller(19, 1))
    const expired: unknown[] = []
    store.observe({}).subscribe(result => expired.push(result))
    expect(expired).toEqual([])
    http.expectNone(() => true)
  })

  it("answers a malformed pair as VALIDATION without dispatching or losing verified data", async () => {
    observe()
    pending().flush(wire())
    const verified = store.result()

    for (const params of [
      { fromDate: "2026-02-30" },
      { fromDate: "2026-02-11", toDate: "2026-01-12" },
      { fromDate: 20260211 as unknown as string }
    ]) {
      const result = await firstValueFrom(store.observe(params))
      expect(result.success).toBe(false)
      if (result.success) throw new Error("expected a failure")
      expect(result.error.code).toBe("VALIDATION")
      expect(store.result()).toBe(verified)
      expect(store.loading()).toBe(false)
      expect(store.error()).toBeUndefined()
    }
    http.expectNone(() => true)
  })

  it("cancels and clears the entry on session replacement", () => {
    observe()
    pending().flush(wire())
    expect(store.result()).toBeDefined()

    observe()
    const pendingRead = pending()
    sessions.next(caller(20))

    expect(pendingRead.cancelled).toBe(true)
    expect(store.result()).toBeUndefined()
    expect(store.verifiedAt()).toBeUndefined()
    expect(store.loading()).toBe(false)
    expect(store.refreshing()).toBe(false)
    expect(store.error()).toBeUndefined()
  })

  it("preserves the entry through same-session credential renewal", () => {
    observe()
    pending().flush(wire())
    const verified = store.result()

    observe()
    const pendingRead = pending()
    sessions.next(caller())

    expect(pendingRead.cancelled).toBe(false)
    expect(store.result()).toBe(verified)
    pendingRead.flush(zeroWire())
    expect(store.result()?.current.servicesToday).toBe(0)
  })

  it("ignores a late completion arriving after its session was replaced", () => {
    reads = new ControlledDashboard()
    given()
    observe()
    const stale = reads.latest()

    sessions.next(caller(20))
    expect(stale.cancelled).toBe(true)
    expect(store.result()).toBeUndefined()

    stale.succeed(view())
    expect(store.result()).toBeUndefined()
    expect(store.verifiedAt()).toBeUndefined()
    expect(store.loading()).toBe(false)
    expect(store.error()).toBeUndefined()
    expect(reads.calls).toHaveLength(1)
  })
})
