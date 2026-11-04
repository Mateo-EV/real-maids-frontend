import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { computed, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Observable, Subscription } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { OperationsError } from "../../domain/errors/operations.error"
import { ServiceRequestSummary } from "../../domain/models/operations-read.models"
import { ServiceRequestQuery } from "../../domain/params/operations.params"
import { provideOperationsRequestReads } from "../../operations.providers"
import { ServiceRequestsStore } from "./service-requests.store"

const url = "https://api.example.test/api/solicitudes"
const deadline = 4102444800000
const caller = (id = 19, expires = deadline, name = "Caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, expires, id)
const dto = (id = 17) => ({
  idSolicitud: id,
  idCliente: 8,
  cliente: "Authorized customer",
  idPropiedad: 31,
  propiedad: "Office",
  idTipoServicio: 4,
  tipoServicio: "Cleaning",
  descripcion: null,
  fechaDeseada: null,
  estado: "registrada",
  registradoPor: "Operator",
  fechaRegistro: "2026-03-02T04:30:00Z",
  fechaActualizacion: null
})
const wirePage = (ids = [17], page = 0, size = 20, total = ids.length) => ({
  contenido: ids.map(dto),
  pagina: page,
  tamanio: size,
  totalElementos: total,
  totalPaginas: Math.ceil(total / size)
})
type Kind = "list" | "detail"
type ReadResult = Result<
  PaginationResponse<ServiceRequestSummary> | ServiceRequestSummary,
  OperationsError
>

// Public HTTP composition: only the public auth-session port is substituted.
describe("ServiceRequestsStore consumer-owned request reads", () => {
  let store: InstanceType<typeof ServiceRequestsStore>
  let http: HttpTestingController
  let session: BehaviorSubject<AuthSession | null>
  let subscriptions: Subscription[]
  let authFactory: ReturnType<typeof vi.fn>
  let sessionFactory: ReturnType<typeof vi.fn>

  beforeEach(() => {
    subscriptions = []
    session = new BehaviorSubject<AuthSession | null>(caller())
    authFactory = vi.fn(() => ({ session: () => session.value }))
    sessionFactory = vi.fn(() => ({ execute: () => session.asObservable() }))
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: API_URL, useValue: "https://api.example.test" },
        { provide: AuthStore, useFactory: authFactory },
        { provide: ObserveAuthSessionUseCase, useFactory: sessionFactory },
        provideOperationsRequestReads()
      ]
    })
  })

  afterEach(() => {
    try {
      subscriptions.forEach(subscription => subscription.unsubscribe())
      TestBed.inject(HttpTestingController).verify()
    } finally {
      vi.restoreAllMocks()
      vi.useRealTimers()
    }
  })

  function setup() {
    http = TestBed.inject(HttpTestingController)
    store = TestBed.inject(ServiceRequestsStore)
  }
  function track(read: Observable<ReadResult>, next?: (result: ReadResult) => void) {
    const subscription = read.subscribe(next)
    subscriptions.push(subscription)
    return subscription
  }
  function observe(kind: Kind, id = 17, force = false) {
    return kind === "list"
      ? store.observeRequests({ customerId: id }, force)
      : store.observeRequest(id, force)
  }
  function select(kind: Kind, id = 17) {
    return kind === "list" ? store.selectRequests({ customerId: id }) : store.selectRequest(id)
  }
  function pending(kind: Kind, id = 17) {
    const request = http.expectOne(r =>
      kind === "list"
        ? r.url === url && r.params.get("idCliente") === String(id)
        : r.url === `${url}/${id}`
    )
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    return request
  }
  function succeed(kind: Kind, id = 17) {
    pending(kind, id).flush(kind === "list" ? wirePage() : dto(id))
  }

  describe("30000ms success-only freshness", () => {
    it.each(["list", "detail"] as const)(
      "%s checks read/revisit expiry, never polls, and retains stale data through force failure",
      kind => {
        vi.useFakeTimers()
        vi.setSystemTime(1000)
        setup()
        const view = computed(() => select(kind))
        expect(view()).toMatchObject({
          result: undefined,
          loading: false,
          refreshing: false,
          expires: 0
        })
        http.expectNone(() => true)
        const first = track(observe(kind))
        expect(view().loading).toBe(true)
        succeed(kind)
        const verified = view().result
        expect(verified).toBeDefined()
        expect(view().expires).toBe(31000)
        vi.advanceTimersByTime(29999)
        track(observe(kind)).unsubscribe()
        http.expectNone(() => true)
        expect(view().expires).toBe(31000)
        vi.advanceTimersByTime(1)
        http.expectNone(() => true)
        first.unsubscribe()
        const expired = track(observe(kind))
        expect(view()).toMatchObject({ result: verified, loading: false, refreshing: true })
        pending(kind).flush({}, { status: 403, statusText: "Forbidden" })
        expect(view()).toMatchObject({
          result: verified,
          refreshing: false,
          error: { code: "FORBIDDEN" }
        })
        expect(view().expires).toBeLessThanOrEqual(31000)
        expired.unsubscribe()
        const retry = track(observe(kind))
        succeed(kind)
        expect(view()).toMatchObject({ result: verified, error: undefined, expires: 61000 })
        retry.unsubscribe()
        vi.setSystemTime(32000)
        const forced = track(observe(kind, 17, true))
        pending(kind).flush({}, { status: 403, statusText: "Forbidden" })
        expect(view().result).toEqual(verified)
        expect(view().expires).toBeLessThanOrEqual(32000)
        forced.unsubscribe()
        const recovery = track(observe(kind))
        pending(kind).flush(kind === "list" ? wirePage([]) : dto())
        expect(view()).toMatchObject({ error: undefined, expires: 62000 })
        if (kind === "list")
          expect(view().result).toEqual({ items: [], total: 0, offset: 0, limit: 20 })
        recovery.unsubscribe()
        vi.setSystemTime(62000)
        http.expectNone(() => true)
        const revisit = track(observe(kind))
        if (kind === "list")
          expect(view().result).toEqual({ items: [], total: 0, offset: 0, limit: 20 })
        pending(kind).flush({}, { status: 403, statusText: "Forbidden" })
        if (kind === "list")
          expect(view().result).toEqual({ items: [], total: 0, offset: 0, limit: 20 })
        revisit.unsubscribe()
      }
    )
  })

  describe("same-key sharing and independent keys", () => {
    it("normalizes and snapshots complete queries, preserving source order and effective metadata", () => {
      setup()
      const query: ServiceRequestQuery = {
        offset: 400,
        limit: 200,
        customerId: 99,
        status: "  ATENDIDA  ",
        from: "2026-03-01",
        until: "2026-03-03"
      }
      const read = store.observeRequests(query)
      query.customerId = 100
      const view = computed(() =>
        store.selectRequests({ ...query, customerId: 99, status: "atendida" })
      )
      track(read)
      track(store.observeRequests({ ...query, customerId: 99, status: "atendida" }))
      const request = http.expectOne(r => r.url === url)
      expect(
        Object.fromEntries(
          request.request.params.keys().map(key => [key, request.request.params.get(key)])
        )
      ).toEqual({
        pagina: "2",
        tamanio: "200",
        idCliente: "99",
        estado: "atendida",
        desde: "2026-03-01",
        hasta: "2026-03-03"
      })
      request.flush({
        ...wirePage([18, 17], 2, 100, 202),
        contenido: [18, 17].map(id => ({ ...dto(id), estado: "atendida" }))
      })
      expect(view().result).toMatchObject({
        items: [
          { id: 18, customerId: 8 },
          { id: 17, customerId: 8 }
        ],
        offset: 200,
        limit: 100,
        total: 202
      })
      for (const other of [
        { customerId: 100 },
        { status: "registrada" },
        { from: "2026-03-02" },
        { until: "2026-03-04" },
        { offset: 200 },
        { limit: 100 }
      ])
        expect(
          store.selectRequests({ ...query, customerId: 99, status: "atendida", ...other }).result
        ).toBeUndefined()
      http.expectNone(() => true)
    })

    it.each(["list", "detail"] as const)(
      "%s shares forced flights and cancels only after the last subscriber",
      kind => {
        setup()
        const first = track(observe(kind))
        const second = track(observe(kind, 17, true))
        const shared = pending(kind)
        const independent = track(observe(kind, 18))
        const other = pending(kind, 18)
        first.unsubscribe()
        expect(shared.cancelled).toBe(false)
        expect(select(kind).loading).toBe(true)
        second.unsubscribe()
        expect(shared.cancelled).toBe(true)
        expect(select(kind)).toMatchObject({ loading: false, refreshing: false, result: undefined })
        expect(other.cancelled).toBe(false)
        other.flush(kind === "list" ? wirePage([]) : dto(18))
        expect(select(kind, 18).result).toBeDefined()
        expect(select(kind).result).toBeUndefined()
        independent.unsubscribe()
        http.expectNone(() => true)
      }
    )
  })

  describe("session scope and server safety", () => {
    it.each(["logout", "identity", "deadline", "expiry"] as const)(
      "%s clears verified state and cancels old flights, unlike renewal",
      action => {
        const now = vi.spyOn(Date, "now").mockReturnValue(1000)
        session.next(caller(19, 60000))
        setup()
        track(store.observeRequests())
        http.expectOne(r => r.url === url).flush(wirePage())
        const view = computed(() => store.selectRequests())
        let deliveries = 0
        const flight = track(store.observeRequest(17), () => deliveries++)
        const request = pending("detail")
        session.next(caller(19, 60000, "Renewed label"))
        expect(request.cancelled).toBe(false)
        track(store.observeRequests()).unsubscribe()
        http.expectNone(() => true)
        expect(view().result).toBeDefined()
        if (action === "expiry") now.mockReturnValue(60000)
        session.next(
          action === "logout"
            ? null
            : action === "identity"
              ? caller(20, 60000)
              : caller(19, action === "deadline" ? 61000 : 60000)
        )
        expect(request.cancelled).toBe(true)
        expect(flight.closed).toBe(true)
        expect(deliveries).toBe(0)
        expect(view().result).toBeUndefined()
        expect(store.selectRequest(17).result).toBeUndefined()
        http.expectNone(() => true)
      }
    )

    it.each(["server", "guest"] as const)(
      "%s dispatches no HTTP; SSR does not initialize auth",
      kind => {
        if (kind === "server") TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
        else session.next(null)
        setup()
        const observations = [track(store.observeRequests()), track(store.observeRequest(17))]
        http.expectNone(() => true)
        expect(observations.every(subscription => subscription.closed)).toBe(true)
        expect(store.selectRequests().result).toBeUndefined()
        if (kind === "server") {
          expect(authFactory).not.toHaveBeenCalled()
          expect(sessionFactory).not.toHaveBeenCalled()
        }
      }
    )
  })

  describe("bounded pinned history and admission safety", () => {
    it("rejects unsafe keys before admission and shares blank-status/default queries", () => {
      setup()
      track(store.observeRequests({ status: "  " }))
      track(store.observeRequests({ offset: 0, limit: 20 }))
      http.expectOne(r => r.url === url).flush(wirePage())
      const view = computed(() => store.selectRequests())
      const verified = view()
      const invalid: ServiceRequestQuery[] = [
        { offset: Number.MAX_SAFE_INTEGER + 1 },
        { offset: 2147483648, limit: 1 },
        { customerId: 2147483648 },
        { from: "2026-02-29" },
        { from: "2026-03-03", until: "2026-03-02" },
        { status: "not-a-request-state" }
      ]
      const rejected: ReadResult[] = []
      invalid.forEach(query => track(store.observeRequests(query), result => rejected.push(result)))
      for (const id of [-1, 1.5, 2147483648]) {
        track(store.observeRequest(id), result => rejected.push(result))
      }
      expect(rejected).toHaveLength(9)
      rejected.forEach(result =>
        expect(result).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      )
      expect(view()).toEqual(verified)
      track(store.observeRequests()).unsubscribe()
      http.expectNone(() => true)
    })

    it.each(["list", "detail"] as const)(
      "%s retains at most twenty entries without evicting an active view",
      kind => {
        setup()
        track(observe(kind, 1))
        succeed(kind, 1)
        for (let id = 2; id <= 22; id++) {
          const subscription = track(observe(kind, id))
          succeed(kind, id)
          subscription.unsubscribe()
        }
        expect(select(kind, 1).result).toBeDefined()
        expect(select(kind, 2).result).toBeUndefined()
        expect(select(kind, 3).result).toBeUndefined()
        expect(select(kind, 4).result).toBeDefined()
        expect(select(kind, 22).result).toBeDefined()
        track(observe(kind, 1)).unsubscribe()
        http.expectNone(() => true)
      }
    )

    it.each(["list", "detail"] as const)(
      "%s rejects invalid/excess keys without changing pinned results or read accounting",
      kind => {
        setup()
        const active = Array.from({ length: 20 }, (_, index) => {
          const subscription = track(observe(kind, index + 1))
          succeed(kind, index + 1)
          return subscription
        })
        const view = computed(() => select(kind, 1))
        const verified = view()
        const rejected: ReadResult[] = []
        track(observe(kind, 21), result => rejected.push(result))
        track(
          kind === "list"
            ? store.observeRequests({ offset: 1, limit: 20 })
            : store.observeRequest(0),
          result => rejected.push(result)
        )
        expect(rejected).toMatchObject([
          { success: false, error: { code: "UNAVAILABLE" } },
          { success: false, error: { code: "INVALID_DATA" } }
        ])
        http.expectNone(() => true)
        expect(view()).toEqual(verified)
        for (let id = 1; id <= 20; id++) expect(select(kind, id).result).toBeDefined()
        active[19].unsubscribe()
        const admitted = track(observe(kind, 21))
        succeed(kind, 21)
        expect(select(kind, 20).result).toBeUndefined()
        expect(select(kind, 1)).toEqual(verified)
        expect(select(kind, 21).result).toBeDefined()
        admitted.unsubscribe()
        http.expectNone(() => true)
      }
    )
  })
})
