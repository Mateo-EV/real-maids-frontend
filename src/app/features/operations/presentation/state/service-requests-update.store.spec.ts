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
import { UpdateServiceRequestUseCase } from "../../application/use-cases/service-request-write.use-cases"
import { provideOperationsRequestReads } from "../../operations.providers"
import { ServiceRequestsStore } from "./service-requests.store"

const url = "https://api.example.test/api/solicitudes"
const caller = (id = 19, deadline = 4102444800000) =>
  AuthSession.create("Caller", "caller@example.test", null, deadline, id)
const input = { propertyId: 31, serviceTypeId: 4, description: null, desiredDate: null }
const dto = (id = 17, owner = 8) => ({
  idSolicitud: id,
  idCliente: owner,
  cliente: `Customer ${owner}`,
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
  contenido: ids.map(id => dto(id)),
  pagina: 0,
  tamanio: 20,
  totalElementos: ids.length,
  totalPaginas: Math.ceil(ids.length / 20)
})

// T5 S1/S3/S4 + L164: real HTTP/application/root store. Expected owner is
// captured request metadata (8), deliberately different from caller identity (19).
describe("ServiceRequestsStore caller-owned update contract", () => {
  let session: BehaviorSubject<AuthSession | null>
  let store: InstanceType<typeof ServiceRequestsStore>
  let http: HttpTestingController
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
    try {
      subscriptions.forEach(s => s.unsubscribe())
      TestBed.inject(HttpTestingController).verify()
    } finally {
      vi.restoreAllMocks()
    }
  })
  function setup() {
    store = TestBed.inject(ServiceRequestsStore)
    http = TestBed.inject(HttpTestingController)
  }
  function observePage(status?: string) {
    const sub = store.observeRequests(status ? { status } : {}).subscribe()
    subscriptions.push(sub)
    return sub
  }
  function observeDetail(id = 17) {
    const sub = store.observeRequest(id).subscribe()
    subscriptions.push(sub)
    return sub
  }
  function seed() {
    observePage()
    http.expectOne(r => r.url === url && r.method === "GET").flush(page())
    observeDetail()
    http.expectOne(`${url}/17`).flush(dto())
  }
  const put = () => http.expectOne(r => r.url === `${url}/17` && r.method === "PUT")

  it("is cold, snapshots input and passes only id/params to the existing use case, never expected owner", async () => {
    setup()
    const execute = vi.spyOn(TestBed.inject(UpdateServiceRequestUseCase), "execute")
    const mutable = { ...input, description: "Captured" }
    const operation = store.updateRequest(17, mutable, 8)
    mutable.description = "Later mutation"
    expect(store.writing()).toBe(false)
    expect(execute).not.toHaveBeenCalled()
    http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    expect(execute).toHaveBeenCalledExactlyOnceWith(17, { ...input, description: "Captured" })
    expect(store.writing()).toBe(true)
    const request = put()
    expect(request.request.body).toEqual({
      idPropiedad: 31,
      idTipoServicio: 4,
      descripcion: "Captured",
      fechaDeseada: null
    })
    expect(request.request.transferCache).toBe(false)
    expect(store.selectRequest(17).result).toBeUndefined()
    request.flush({ ...dto(), descripcion: "Captured" })
    expect(await pending).toMatchObject({ success: true, data: { id: 17, customerId: 8 } })
    expect(store.writing()).toBe(false)
    expect(history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    http.expectNone(() => true)
  })

  it("uses the shared create/update writing gate in both directions without dispatching duplicates", async () => {
    setup()
    const updating = firstValueFrom(store.updateRequest(17, input, 8))
    const request = put()
    for (const operation of [
      store.updateRequest(17, input, 8),
      store.createRequest({ ...input, customerId: 8 })
    ])
      expect(await firstValueFrom(operation)).toMatchObject({
        success: false,
        error: { code: "CONFLICT" }
      })
    http.expectNone(() => true)
    request.flush(dto())
    await updating
    const creating = firstValueFrom(store.createRequest({ ...input, customerId: 8 }))
    const post = http.expectOne(r => r.method === "POST")
    expect(await firstValueFrom(store.updateRequest(17, input, 8))).toMatchObject({
      success: false,
      error: { code: "CONFLICT" }
    })
    http.expectNone(() => true)
    post.flush(dto(18))
    await creating
    expect(store.writing()).toBe(false)
  })

  it("refreshes all active query variants and target detail once, invalidates inactive history, and never patches rows", async () => {
    setup()
    seed()
    observePage()
    observeDetail()
    observePage("registrada")
    http.expectOne(r => r.url === url && r.params.get("estado") === "registrada").flush(page())
    const inactive = observePage("cancelada")
    http.expectOne(r => r.url === url && r.params.get("estado") === "cancelada").flush(page([]))
    inactive.unsubscribe()
    observeDetail(18)
    http.expectOne(`${url}/18`).flush(dto(18))
    const previousPage = store.selectRequests().result
    const previousDetail = store.selectRequest(17).result
    const unrelated = store.selectRequest(18)
    const pending = firstValueFrom(store.updateRequest(17, input, 8))
    put().flush({ ...dto(), descripcion: "Server update" })
    expect((await pending).success).toBe(true)
    const refreshes = http.match(r => r.url === url && r.method === "GET")
    expect(refreshes).toHaveLength(2)
    const detail = http.expectOne(`${url}/17`)
    expect(store.selectRequests()).toMatchObject({ result: previousPage, refreshing: true })
    expect(store.selectRequest(17)).toMatchObject({ result: previousDetail, refreshing: true })
    expect(store.selectRequests({ status: "cancelada" }).expires).toBe(0)
    expect(store.selectRequest(18)).toEqual(unrelated)
    expect(history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    refreshes.forEach(r => r.flush(page([])))
    detail.flush({ ...dto(), descripcion: "Verified refresh" })
    expect(store.selectRequests().result?.total).toBe(0)
    expect(store.selectRequest(17).result?.description).toBe("Verified refresh")
    http.expectNone(() => true)
  })

  it.each(["wrong-owner", "wrong-target", "malformed", "forbidden"] as const)(
    "rejects %s success/error without invalidating any cache or owner history",
    async failure => {
      setup()
      seed()
      const previousPage = store.selectRequests()
      const previousDetail = store.selectRequest(17)
      const pending = firstValueFrom(store.updateRequest(17, input, 8))
      const request = put()
      if (failure === "forbidden")
        request.flush({ mensaje: "RAW INTERNAL" }, { status: 403, statusText: "Forbidden" })
      else
        request.flush(
          failure === "wrong-owner"
            ? dto(17, 9)
            : failure === "wrong-target"
              ? dto(18)
              : { ...dto(), cliente: null }
        )
      const result = await pending
      expect(result).toMatchObject({
        success: false,
        error: { code: failure === "forbidden" ? "FORBIDDEN" : "INVALID_RESPONSE" }
      })
      expect(store.selectRequests()).toEqual(previousPage)
      expect(store.selectRequest(17)).toEqual(previousDetail)
      expect(history.invalidateCustomer).not.toHaveBeenCalled()
      expect(store.writing()).toBe(false)
      http.expectNone(() => true)
    }
  )

  it.each([0, -1, 1.5, 2147483648, Number.NaN])(
    "rejects invalid expected owner %s before PUT",
    async owner => {
      setup()
      expect(await firstValueFrom(store.updateRequest(17, input, owner))).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
      expect(store.writing()).toBe(false)
      expect(history.invalidateCustomer).not.toHaveBeenCalled()
      http.expectNone(() => true)
    }
  )

  it("keeps confirmed success separate from failed revalidation; GET-only retry retains stale records", async () => {
    setup()
    seed()
    const before = store.selectRequest(17).result
    const pending = firstValueFrom(store.updateRequest(17, input, 8))
    put().flush(dto())
    expect((await pending).success).toBe(true)
    http.expectOne(r => r.url === url && r.method === "GET").error(new ProgressEvent("error"))
    http.expectOne(`${url}/17`).flush({}, { status: 403, statusText: "Forbidden" })
    expect(store.selectRequest(17)).toMatchObject({
      result: before,
      error: { code: "FORBIDDEN" },
      expires: 0
    })
    expect(store.selectRequests().result?.total).toBe(1)
    subscriptions.push(store.observeRequest(17, true).subscribe())
    http.expectOne(`${url}/17`).flush(dto())
    expect(history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    http.expectNone(() => true)
  })

  it("invalidates unobserved target/page without an orphan root read and shares active refresh cancellation", async () => {
    setup()
    const a = observePage(),
      b = observePage(),
      detail = observeDetail()
    http.expectOne(r => r.url === url).flush(page())
    http.expectOne(`${url}/17`).flush(dto())
    detail.unsubscribe()
    const pending = firstValueFrom(store.updateRequest(17, input, 8))
    put().flush(dto())
    await pending
    const refresh = http.expectOne(r => r.url === url)
    expect(store.selectRequest(17).expires).toBe(0)
    a.unsubscribe()
    expect(refresh.cancelled).toBe(false)
    b.unsubscribe()
    expect(refresh.cancelled).toBe(true)
    http.expectNone(() => true)
  })

  it("cancels a caller-owned PUT without success/invalidation and permits an explicit new attempt", () => {
    setup()
    seed()
    const before = store.selectRequests()
    const delivered = vi.fn()
    const sub = store.updateRequest(17, input, 8).subscribe(delivered)
    const request = put()
    sub.unsubscribe()
    expect(request.cancelled).toBe(true)
    expect(delivered).not.toHaveBeenCalled()
    expect(store.writing()).toBe(false)
    expect(store.selectRequests()).toEqual(before)
    expect(history.invalidateCustomer).not.toHaveBeenCalled()
    subscriptions.push(store.updateRequest(17, input, 8).subscribe())
    put().flush({}, { status: 409, statusText: "Conflict" })
    http.expectNone(() => true)
  })

  it.each(["replacement", "deadline", "logout"] as const)(
    "preserves renewal but cancels/fences %s",
    replacement => {
      setup()
      seed()
      const delivered = vi.fn()
      subscriptions.push(store.updateRequest(17, input, 8).subscribe(delivered))
      const request = put()
      session.next(caller())
      expect(request.cancelled).toBe(false)
      expect(store.writing()).toBe(true)
      session.next(
        replacement === "logout"
          ? null
          : replacement === "deadline"
            ? caller(19, 4102444800001)
            : caller(20)
      )
      expect(request.cancelled).toBe(true)
      expect(delivered).not.toHaveBeenCalled()
      expect(store.writing()).toBe(false)
      expect(store.selectRequest(17).result).toBeUndefined()
      expect(history.invalidateCustomer).not.toHaveBeenCalled()
      http.expectNone(() => true)
    }
  )

  it("does not let an old update finalizer decrement a replacement-session write", () => {
    setup()
    subscriptions.push(
      store.updateRequest(17, input, 8).subscribe(result => {
        if (!result.success) return
        session.next(caller(20))
        subscriptions.push(store.updateRequest(17, input, 8).subscribe())
      })
    )
    put().flush(dto())
    const replacement = put()
    expect(store.writing()).toBe(true)
    replacement.flush(dto())
    expect(store.writing()).toBe(false)
    expect(history.invalidateCustomer).toHaveBeenCalledTimes(2)
    http.expectNone(() => true)
  })

  it.each(["guest", "server"] as const)("dispatches and delivers no update for %s", mode => {
    if (mode === "guest") session.next(null)
    else TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    setup()
    const delivered = vi.fn()
    subscriptions.push(store.updateRequest(17, input, 8).subscribe(delivered))
    expect(delivered).not.toHaveBeenCalled()
    expect(store.writing()).toBe(false)
    expect(history.invalidateCustomer).not.toHaveBeenCalled()
    http.expectNone(() => true)
  })
})
