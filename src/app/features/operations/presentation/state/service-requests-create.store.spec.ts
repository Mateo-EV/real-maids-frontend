import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, firstValueFrom, Subscription } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { CustomerHistoryStore } from "@/app/features/customers/presentation/state/customer-history.store"
import { provideOperationsRequestReads } from "../../operations.providers"
import { ServiceRequestsStore } from "./service-requests.store"

const url = "https://api.example.test/api/solicitudes"
const caller = (id = 19) =>
  AuthSession.create("Caller", "caller@example.test", null, 4102444800000, id)
const input = {
  customerId: 8,
  propertyId: 31,
  serviceTypeId: 4,
  description: null,
  desiredDate: null
}
const dto = (id = 18) => ({
  idSolicitud: id,
  idCliente: 8,
  cliente: "Customer",
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
const page = (ids = [17]) => ({
  contenido: ids.map(dto),
  pagina: 0,
  tamanio: 20,
  totalElementos: ids.length,
  totalPaginas: Math.ceil(ids.length / 20)
})

describe("ServiceRequestsStore caller-owned creation", () => {
  let session: BehaviorSubject<AuthSession | null>
  let store: InstanceType<typeof ServiceRequestsStore>, http: HttpTestingController
  let subscriptions: Subscription[]
  const history = { invalidateCustomer: vi.fn() }
  beforeEach(() => {
    history.invalidateCustomer.mockReset()
    subscriptions = []
    session = new BehaviorSubject<AuthSession | null>(caller())
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideOperationsRequestReads(),
        { provide: API_URL, useValue: "https://api.example.test" },
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: AuthStore, useValue: { session: () => session.value } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
        { provide: CustomerHistoryStore, useValue: history }
      ]
    })
  })
  afterEach(() => {
    subscriptions.forEach(s => s.unsubscribe())
    TestBed.inject(HttpTestingController).verify()
  })
  function setup() {
    store = TestBed.inject(ServiceRequestsStore)
    http = TestBed.inject(HttpTestingController)
  }
  function observe() {
    const subscription = store.observeRequests({}).subscribe()
    subscriptions.push(subscription)
    return subscription
  }
  function seed() {
    observe()
    http.expectOne(r => r.url === url && r.method === "GET").flush(page())
  }

  it("keeps creation cold and prevents concurrent duplicate writes without allocating local rows", async () => {
    setup()
    const operation = store.createRequest(input)
    expect(store.writing()).toBe(false)
    http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    const post = http.expectOne(r => r.method === "POST" && r.url === url)
    expect(store.writing()).toBe(true)
    expect(await firstValueFrom(store.createRequest(input))).toMatchObject({
      success: false,
      error: { code: "CONFLICT" }
    })
    http.expectNone(() => true)
    post.flush(dto())
    expect(await pending).toMatchObject({ success: true, data: { id: 18 } })
    expect(store.writing()).toBe(false)
    expect(store.selectRequests({}).result).toBeUndefined()
    expect(history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    http.expectNone(() => true)
  })

  it("shares one observed-page refresh after confirmed success and preserves stale rows until server response", async () => {
    setup()
    seed()
    observe()
    const before = store.selectRequests({}).result
    const pending = firstValueFrom(store.createRequest(input))
    expect(store.selectRequests({}).result).toBe(before)
    http.expectOne(r => r.method === "POST").flush(dto())
    expect((await pending).success).toBe(true)
    const refresh = http.expectOne(r => r.method === "GET" && r.url === url)
    expect(store.selectRequests({})).toMatchObject({ result: before, refreshing: true })
    refresh.flush(page([]))
    expect(store.selectRequests({})).toMatchObject({
      result: { items: [], total: 0 },
      refreshing: false
    })
    expect(history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    http.expectNone(() => true)
  })

  it("invalidates inactive query data without launching an orphan root refresh", async () => {
    setup()
    const observer = observe()
    http.expectOne(r => r.method === "GET").flush(page())
    observer.unsubscribe()
    const pending = firstValueFrom(store.createRequest(input))
    http.expectOne(r => r.method === "POST").flush(dto())
    expect((await pending).success).toBe(true)
    expect(store.selectRequests({}).result?.items[0].id).toBe(17)
    expect(store.selectRequests({}).expires).toBe(0)
    http.expectNone(() => true)
  })

  it("does not invalidate verified reads or history on rejected creation and allows explicit retry", async () => {
    setup()
    seed()
    const before = store.selectRequests({})
    const rejected = firstValueFrom(store.createRequest(input))
    http.expectOne(r => r.method === "POST").flush({}, { status: 403, statusText: "Forbidden" })
    expect(await rejected).toMatchObject({ success: false, error: { code: "FORBIDDEN" } })
    expect(store.selectRequests({})).toEqual(before)
    expect(store.writing()).toBe(false)
    expect(history.invalidateCustomer).not.toHaveBeenCalled()
    http.expectNone(() => true)
    const retry = store.createRequest(input).subscribe()
    subscriptions.push(retry)
    const post = http.expectOne(r => r.method === "POST")
    retry.unsubscribe()
    expect(post.cancelled).toBe(true)
  })

  it("cancels observation without a fabricated success or invalidation", () => {
    setup()
    seed()
    const before = store.selectRequests({})
    const delivered = vi.fn(),
      subscription = store.createRequest(input).subscribe(delivered)
    const post = http.expectOne(r => r.method === "POST")
    subscription.unsubscribe()
    expect(post.cancelled).toBe(true)
    expect(delivered).not.toHaveBeenCalled()
    expect(store.writing()).toBe(false)
    expect(store.selectRequests({})).toEqual(before)
    expect(history.invalidateCustomer).not.toHaveBeenCalled()
    http.expectNone(() => true)
  })

  it("keeps confirmed write success when its GET revalidation fails without replaying POST", async () => {
    setup()
    seed()
    const before = store.selectRequests({}).result
    const pending = firstValueFrom(store.createRequest(input))
    http.expectOne(r => r.method === "POST").flush(dto())
    expect((await pending).success).toBe(true)
    http.expectOne(r => r.method === "GET").flush({}, { status: 403, statusText: "Forbidden" })
    expect(store.selectRequests({})).toMatchObject({
      result: before,
      error: { code: "FORBIDDEN" },
      expires: 0
    })
    expect(history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    http.expectNone(() => true)
  })

  it("shares refresh cancellation between observed consumers instead of keeping a root subscription", async () => {
    setup()
    const a = observe(),
      b = observe()
    http.expectOne(r => r.method === "GET").flush(page())
    const pending = firstValueFrom(store.createRequest(input))
    http.expectOne(r => r.method === "POST").flush(dto())
    await pending
    const refresh = http.expectOne(r => r.method === "GET")
    a.unsubscribe()
    expect(refresh.cancelled).toBe(false)
    b.unsubscribe()
    expect(refresh.cancelled).toBe(true)
    http.expectNone(() => true)
  })

  it("clears and cancels pending old-session writes but renewal preserves them", () => {
    setup()
    seed()
    const delivered = vi.fn()
    subscriptions.push(store.createRequest(input).subscribe(delivered))
    const post = http.expectOne(r => r.method === "POST")
    session.next(caller())
    expect(post.cancelled).toBe(false)
    expect(store.writing()).toBe(true)
    session.next(caller(20))
    expect(post.cancelled).toBe(true)
    expect(delivered).not.toHaveBeenCalled()
    expect(store.writing()).toBe(false)
    expect(store.selectRequests({}).result).toBeUndefined()
    expect(history.invalidateCustomer).not.toHaveBeenCalled()
    http.expectNone(() => true)
  })

  it("does not let an old finalizer decrement a replacement session pending write", () => {
    setup()
    subscriptions.push(
      store.createRequest(input).subscribe(result => {
        if (!result.success) return
        session.next(caller(20))
        subscriptions.push(store.createRequest(input).subscribe())
      })
    )
    http.expectOne(r => r.method === "POST").flush(dto())
    const replacement = http.expectOne(r => r.method === "POST")
    expect(store.writing()).toBe(true)
    replacement.flush(dto(19))
    expect(store.writing()).toBe(false)
    expect(history.invalidateCustomer).toHaveBeenCalledTimes(2)
    http.expectNone(() => true)
  })

  it.each(["guest", "server"] as const)("dispatches no writes for %s", mode => {
    if (mode === "guest") session.next(null)
    else TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    setup()
    const delivered = vi.fn()
    subscriptions.push(store.createRequest(input).subscribe(delivered))
    expect(delivered).not.toHaveBeenCalled()
    expect(store.writing()).toBe(false)
    expect(history.invalidateCustomer).not.toHaveBeenCalled()
    http.expectNone(() => true)
  })
})
