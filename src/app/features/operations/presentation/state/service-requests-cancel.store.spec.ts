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
import { CancelServiceRequestUseCase } from "../../application/use-cases/service-request-write.use-cases"
import { provideOperationsRequestReads } from "../../operations.providers"
import { ServiceRequestsStore } from "./service-requests.store"

const url = "https://api.example.test/api/solicitudes"
const caller = (id = 19, deadline = 4102444800000) =>
  AuthSession.create("Caller", "caller@example.test", null, deadline, id)
const create = {
  customerId: 8,
  propertyId: 31,
  serviceTypeId: 4,
  description: null,
  desiredDate: null
}
const update = { propertyId: 31, serviceTypeId: 4, description: null, desiredDate: null }
const dto = (id = 17, owner = 8, status = "registrada") => ({
  idSolicitud: id,
  idCliente: owner,
  cliente: "Captured customer",
  idPropiedad: 31,
  propiedad: "Property",
  idTipoServicio: 4,
  tipoServicio: "Service",
  descripcion: null,
  fechaDeseada: null,
  estado: status,
  registradoPor: "Operator",
  fechaRegistro: "2026-03-02T04:30:00Z",
  fechaActualizacion: null
})
const cancelled = (id = 17, owner = 8) => dto(id, owner, "cancelada")
const page = (items = [dto()]) => ({
  contenido: items,
  pagina: 0,
  tamanio: 20,
  totalElementos: items.length,
  totalPaginas: items.length ? 1 : 0
})

describe("caller-owned request cancellation coordination", () => {
  let session: BehaviorSubject<AuthSession | null>
  let store: InstanceType<typeof ServiceRequestsStore>
  let http: HttpTestingController
  let subscriptions: Subscription[]
  const history = { invalidateCustomer: vi.fn() }
  beforeEach(() => {
    subscriptions = []
    history.invalidateCustomer.mockReset()
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
    store = TestBed.inject(ServiceRequestsStore)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => {
    try {
      subscriptions.forEach(s => s.unsubscribe())
      http.verify()
    } finally {
      vi.restoreAllMocks()
    }
  })
  const post = () => http.expectOne(r => r.url === url + "/17/cancelacion" && r.method === "POST")
  function seed() {
    subscriptions.push(store.observeRequests().subscribe(), store.observeRequest(17).subscribe())
    http.expectOne(r => r.url === url && r.method === "GET").flush(page())
    http.expectOne(url + "/17").flush(dto())
  }

  it("captures a cold reason and expected owner without putting owner identity on the wire", async () => {
    const execute = vi.spyOn(TestBed.inject(CancelServiceRequestUseCase), "execute")
    const input = { reason: "  Captured reason  " }
    const operation = store.cancelRequest(17, input, 8)
    input.reason = "Later mutation"
    expect(store.writing()).toBe(false)
    expect(execute).not.toHaveBeenCalled()
    http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    expect(execute).toHaveBeenCalledExactlyOnceWith(17, { reason: "  Captured reason  " })
    expect(store.writing()).toBe(true)
    const request = post()
    expect(request.request.body).toEqual({ motivo: "Captured reason" })
    expect(request.request.transferCache).toBe(false)
    request.flush(cancelled())
    expect(await pending).toMatchObject({
      success: true,
      data: { id: 17, customerId: 8, status: "cancelada" }
    })
    expect(store.writing()).toBe(false)
    expect(history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    http.expectNone(() => true)
  })

  it.each(["create", "update"] as const)(
    "shares the %s write gate in both directions",
    async action => {
      const cancelling = firstValueFrom(store.cancelRequest(17, { reason: "Reason" }, 8))
      const request = post()
      for (const operation of [
        store.cancelRequest(17, { reason: "Duplicate" }, 8),
        store.createRequest(create),
        store.updateRequest(17, update, 8)
      ])
        expect(await firstValueFrom(operation)).toMatchObject({
          success: false,
          error: { code: "CONFLICT" }
        })
      http.expectNone(() => true)
      request.flush(cancelled())
      await cancelling
      const writing = firstValueFrom(
        action === "create" ? store.createRequest(create) : store.updateRequest(17, update, 8)
      )
      const other = http.expectOne(r => r.method === (action === "create" ? "POST" : "PUT"))
      expect(await firstValueFrom(store.cancelRequest(17, { reason: "Reason" }, 8))).toMatchObject({
        success: false,
        error: { code: "CONFLICT" }
      })
      http.expectNone(() => true)
      other.flush(dto())
      await writing
      expect(store.writing()).toBe(false)
    }
  )

  it("invalidates pages/target/actual owner once, refreshes active keys only and retains unpatched stale data", async () => {
    seed()
    subscriptions.push(
      store.observeRequests().subscribe(),
      store.observeRequest(17).subscribe(),
      store.observeRequests({ status: "registrada" }).subscribe(),
      store.observeRequest(18).subscribe()
    )
    http.expectOne(r => r.url === url && r.params.get("estado") === "registrada").flush(page())
    http.expectOne(url + "/18").flush(dto(18))
    const inactive = store.observeRequests({ status: "cancelada" }).subscribe()
    subscriptions.push(inactive)
    http.expectOne(r => r.url === url && r.params.get("estado") === "cancelada").flush(page([]))
    inactive.unsubscribe()
    const beforePage = store.selectRequests().result,
      beforeDetail = store.selectRequest(17).result
    const unrelated = store.selectRequest(18)
    const pending = firstValueFrom(store.cancelRequest(17, { reason: "Reason" }, 8))
    post().flush(cancelled())
    expect((await pending).success).toBe(true)
    const pages = http.match(r => r.url === url && r.method === "GET")
    expect(pages).toHaveLength(2)
    const detail = http.expectOne(url + "/17")
    expect(store.selectRequests()).toMatchObject({ result: beforePage, refreshing: true })
    expect(store.selectRequest(17)).toMatchObject({ result: beforeDetail, refreshing: true })
    expect(store.selectRequest(18)).toEqual(unrelated)
    expect(store.selectRequests({ status: "cancelada" }).expires).toBe(0)
    expect(history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    pages.forEach(r => r.flush(page([])))
    detail.error(new ProgressEvent("error"))
    expect(store.selectRequest(17)).toMatchObject({ result: beforeDetail, expires: 0 })
    expect(store.selectRequest(17).error).toBeDefined()
    subscriptions.push(store.observeRequest(17, true).subscribe())
    http.expectOne(url + "/17").flush(cancelled())
    expect(store.selectRequest(17).result?.status).toBe("cancelada")
    http.expectNone(() => true)
  })

  it.each(["wrong-owner", "wrong-target", "wrong-state", "forbidden", "network"] as const)(
    "rejects %s without touching stored pages/detail/history or replaying the POST",
    async failure => {
      seed()
      const beforePage = store.selectRequests(),
        beforeDetail = store.selectRequest(17)
      const pending = firstValueFrom(store.cancelRequest(17, { reason: "Reason" }, 8))
      const request = post()
      if (failure === "forbidden")
        request.flush({ mensaje: "RAW" }, { status: 403, statusText: "Forbidden" })
      else if (failure === "network") request.error(new ProgressEvent("error"))
      else
        request.flush(
          failure === "wrong-owner"
            ? cancelled(17, 9)
            : failure === "wrong-target"
              ? cancelled(18)
              : dto()
        )
      expect(await pending).toMatchObject({
        success: false,
        error: {
          code:
            failure === "forbidden"
              ? "FORBIDDEN"
              : failure === "network"
                ? "UNAVAILABLE"
                : "INVALID_RESPONSE"
        }
      })
      expect(store.selectRequests()).toEqual(beforePage)
      expect(store.selectRequest(17)).toEqual(beforeDetail)
      expect(history.invalidateCustomer).not.toHaveBeenCalled()
      expect(store.writing()).toBe(false)
      http.expectNone(() => true)
    }
  )

  it.each([0, -1, 1.5, 2147483648, Number.NaN])(
    "rejects invalid captured owner %s with no HTTP or counters",
    async owner => {
      expect(
        await firstValueFrom(store.cancelRequest(17, { reason: "Reason" }, owner))
      ).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      expect(store.writing()).toBe(false)
      expect(history.invalidateCustomer).not.toHaveBeenCalled()
      http.expectNone(() => true)
    }
  )

  it("cancels on session replacement and fences old finalizers while renewal preserves the new write", () => {
    const old = store.cancelRequest(17, { reason: "Old" }, 8).subscribe()
    subscriptions.push(old)
    const abandoned = post()
    session.next(caller(20))
    expect(abandoned.cancelled).toBe(true)
    expect(store.writing()).toBe(false)
    const current = store.cancelRequest(17, { reason: "New" }, 8).subscribe()
    subscriptions.push(current)
    const request = post()
    old.unsubscribe()
    session.next(caller(20))
    expect(request.cancelled).toBe(false)
    expect(store.writing()).toBe(true)
    request.flush(cancelled())
    expect(store.writing()).toBe(false)
    expect(history.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(8)
    http.expectNone(() => true)
  })
})
