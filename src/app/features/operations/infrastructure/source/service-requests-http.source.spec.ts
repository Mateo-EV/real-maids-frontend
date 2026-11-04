import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable } from "rxjs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { Result } from "@/app/shared/utils/result"
import { OperationsError } from "../../domain/errors/operations.error"
import { ServiceRequestQuery } from "../../domain/params/operations.params"
import { ServiceRequestsHttpSource } from "./service-requests-http.source"

const url = "https://api.example.test/api/solicitudes"
const dto = {
  idSolicitud: 17,
  idCliente: 8,
  cliente: "Cliente autorizado",
  idPropiedad: 31,
  propiedad: "Oficina",
  idTipoServicio: 4,
  tipoServicio: "Limpieza",
  descripcion: null,
  fechaDeseada: null,
  estado: "registrada",
  registradoPor: "Operadora",
  fechaRegistro: "2026-03-01T23:30:00-05:00",
  fechaActualizacion: null
}
const summary = {
  id: 17,
  customerId: 8,
  customerName: "Cliente autorizado",
  propertyId: 31,
  propertyName: "Oficina",
  serviceTypeId: 4,
  serviceTypeName: "Limpieza",
  description: null,
  desiredDate: null,
  status: "registrada",
  registeredByName: "Operadora",
  registeredAt: new Date("2026-03-02T04:30:00Z"),
  updatedAt: null
}
const page = (contenido: unknown[] = [dto]) => ({
  contenido,
  pagina: 0,
  tamanio: 20,
  totalElementos: contenido.length,
  totalPaginas: Math.ceil(contenido.length / 20)
})

describe("ServiceRequestsHttpSource read boundary", () => {
  let source: ServiceRequestsHttpSource
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ServiceRequestsHttpSource,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: API_URL, useValue: "https://api.example.test" }
      ]
    })
  })
  afterEach(() => TestBed.inject(HttpTestingController).verify())

  function injectSource() {
    source = TestBed.inject(ServiceRequestsHttpSource)
    http = TestBed.inject(HttpTestingController)
  }

  function reads(): Observable<Result<unknown, OperationsError>>[] {
    return [source.getRequests({}), source.getRequest(17)]
  }

  it("GETs the default page without a synthesized customer filter and maps nullable fields", async () => {
    injectSource()
    const pending = firstValueFrom(source.getRequests({}))
    const req = http.expectOne(r => r.url === url)
    expect(req.request.method).toBe("GET")
    expect(req.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    expect(req.request.params.get("pagina")).toBe("0")
    expect(req.request.params.get("tamanio")).toBe("20")
    expect(req.request.transferCache).toBe(false)
    req.flush(page())
    expect(await pending).toMatchObject({
      success: true,
      data: { items: [summary], total: 1, offset: 0, limit: 20 }
    })
  })

  it("transports documented registration filters and adopts capped effective metadata and server customer scope", async () => {
    injectSource()
    const pending = firstValueFrom(
      source.getRequests({
        offset: 400,
        limit: 200,
        customerId: 99,
        status: "  ATENDIDA  ",
        from: "2024-02-29",
        until: "2024-03-01"
      })
    )
    const req = http.expectOne(r => r.url === url)
    expect(req.request.method).toBe("GET")
    expect(req.request.transferCache).toBe(false)
    expect(req.request.params.keys().sort()).toEqual([
      "desde",
      "estado",
      "hasta",
      "idCliente",
      "pagina",
      "tamanio"
    ])
    expect(
      Object.fromEntries(req.request.params.keys().map(key => [key, req.request.params.get(key)]))
    ).toEqual({
      pagina: "2",
      tamanio: "200",
      idCliente: "99",
      estado: "atendida",
      desde: "2024-02-29",
      hasta: "2024-03-01"
    })
    req.flush({
      contenido: [
        {
          ...dto,
          estado: "atendida",
          descripcion: "  Texto literal  ",
          fechaDeseada: "2024-03-01",
          fechaRegistro: "2024-02-29T23:30:00-05:00",
          fechaActualizacion: "2024-03-01T07:45:00+02:00"
        }
      ],
      pagina: 2,
      tamanio: 100,
      totalElementos: 201,
      totalPaginas: 3
    })
    expect(await pending).toMatchObject({
      success: true,
      data: {
        offset: 200,
        limit: 100,
        total: 201,
        items: [
          {
            ...summary,
            status: "atendida",
            description: "  Texto literal  ",
            desiredDate: "2024-03-01",
            registeredAt: new Date("2024-03-01T04:30:00Z"),
            updatedAt: new Date("2024-03-01T05:45:00Z")
          }
        ]
      }
    })
  })

  it("GETs the requested detail and preserves supplied names, calendar text and offset instants", async () => {
    injectSource()
    const pending = firstValueFrom(source.getRequest(17))
    const req = http.expectOne(`${url}/17`)
    expect(req.request.method).toBe("GET")
    expect(req.request.params.keys()).toEqual([])
    expect(req.request.transferCache).toBe(false)
    req.flush({ ...dto, descripcion: "", fechaDeseada: "2026-03-03" })
    expect(await pending).toMatchObject({
      success: true,
      data: { ...summary, description: "", desiredDate: "2026-03-03" }
    })
  })

  it("rejects a detail DTO for a different request ID as INVALID_RESPONSE", async () => {
    injectSource()
    const pending = firstValueFrom(source.getRequest(17))
    const req = http.expectOne(`${url}/17`)
    expect(req.request.method).toBe("GET")
    expect(req.request.params.keys()).toEqual([])
    expect(req.request.transferCache).toBe(false)
    req.flush({ ...dto, idSolicitud: 18 })
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })

  it("rejects invalid public query arguments and calendar/paging bounds without HTTP", async () => {
    injectSource()
    const invalid: ServiceRequestQuery[] = [
      { customerId: 0 },
      { customerId: 2147483648 },
      { status: "pendiente" },
      { from: "2025-02-29" },
      { until: "2024-02-30" },
      { from: "2024-03-02", until: "2024-03-01" },
      { from: "2024-03-01T00:00:00Z" },
      { offset: -1 },
      { offset: 1, limit: 20 },
      { limit: 0 },
      { limit: 1.5 },
      { limit: 2147483648 },
      { offset: 2147483648, limit: 1 },
      { offset: Number.MAX_SAFE_INTEGER + 1 },
      { limit: Infinity }
    ]
    for (const query of invalid) {
      expect(await firstValueFrom(source.getRequests(query))).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
      http.expectNone(() => true)
    }
  })

  it("rejects invalid public detail IDs without HTTP", async () => {
    injectSource()
    for (const id of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
      expect(await firstValueFrom(source.getRequest(id))).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
      http.expectNone(() => true)
    }
  })

  it("rejects malformed detail fields and impossible or offsetless dates", async () => {
    injectSource()
    const malformed: (object | null)[] = [
      null,
      [],
      { ...dto, idCliente: 0 },
      { ...dto, idPropiedad: 2147483648 },
      { ...dto, idTipoServicio: 1.5 },
      { ...dto, cliente: null },
      { ...dto, propiedad: 31 },
      { ...dto, tipoServicio: null },
      { ...dto, registradoPor: 9 },
      { ...dto, descripcion: false },
      { ...dto, estado: "pendiente" },
      { ...dto, fechaDeseada: "2025-02-29" },
      { ...dto, fechaDeseada: "2024-04-31" },
      { ...dto, fechaRegistro: "2026-03-01T12:00:00" },
      { ...dto, fechaRegistro: "2025-02-29T12:00:00Z" },
      { ...dto, fechaRegistro: "2026-03-01T24:00:00Z" },
      { ...dto, fechaRegistro: "2026-03-01T12:60:00Z" },
      { ...dto, fechaRegistro: "2026-03-01T12:00:60Z" },
      { ...dto, fechaRegistro: "2026-03-01T12:00:00+18:01" },
      { ...dto, fechaRegistro: "2026-03-01T12:00:00+01:60" },
      { ...dto, fechaActualizacion: "2026-02-30T12:00:00Z" },
      ...Object.keys(dto).map(key => {
        const missing: Record<string, unknown> = { ...dto }
        delete missing[key]
        return missing
      })
    ]
    for (const value of malformed) {
      const pending = firstValueFrom(source.getRequest(17))
      http.expectOne(`${url}/17`).flush(value)
      expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    }
  })

  it("rejects malformed pages, duplicate IDs and inconsistent cardinality without repairing them", async () => {
    injectSource()
    const malformed: (object | null)[] = [
      null,
      [],
      { ...page(), contenido: null },
      { ...page(), pagina: -1 },
      { ...page(), pagina: 1 },
      { ...page(), tamanio: 0 },
      { ...page(), tamanio: 101 },
      { ...page(), tamanio: 21 },
      { ...page(), totalElementos: -1 },
      { ...page(), totalElementos: Number.MAX_SAFE_INTEGER + 1 },
      { ...page(), totalPaginas: 2 },
      { ...page(), totalElementos: 2 },
      { ...page(), contenido: [] },
      page([dto, dto]),
      page([{ ...dto, idSolicitud: 0 }]),
      page([{ ...dto, fechaDeseada: "2026-02-30" }])
    ]
    for (const value of malformed) {
      const pending = firstValueFrom(source.getRequests({}))
      http.expectOne(r => r.url === url).flush(value)
      expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    }
  })

  it("preserves server order, literal text, known alternate states and leap-day instants", async () => {
    injectSource()
    const pending = firstValueFrom(source.getRequests({}))
    http
      .expectOne(r => r.url === url)
      .flush(
        page([
          {
            ...dto,
            idSolicitud: 18,
            estado: "cancelada",
            cliente: "  Nombre literal  ",
            descripcion: "",
            fechaDeseada: "2024-03-01",
            fechaRegistro: "2024-02-29T12:34:56.123456789Z",
            fechaActualizacion: "2024-03-01T01:02:03+00:00"
          },
          dto
        ])
      )
    const result = await pending
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.items.map(item => item.id)).toEqual([18, 17])
      expect(result.data.items[0]).toMatchObject({
        status: "cancelada",
        customerName: "  Nombre literal  ",
        description: "",
        desiredDate: "2024-03-01",
        registeredAt: new Date("2024-02-29T12:34:56.123Z"),
        updatedAt: new Date("2024-03-01T01:02:03Z")
      })
    }
  })

  it("accepts both an empty collection and a valid empty out-of-range page", async () => {
    injectSource()
    for (const total of [0, 21]) {
      const pending = firstValueFrom(source.getRequests({ offset: 40, limit: 20 }))
      http
        .expectOne(r => r.url === url && r.params.get("pagina") === "2")
        .flush({
          contenido: [],
          pagina: 2,
          tamanio: 20,
          totalElementos: total,
          totalPaginas: Math.ceil(total / 20)
        })
      expect(await pending).toMatchObject({
        success: true,
        data: { items: [], total, offset: 40, limit: 20 }
      })
    }
  })

  it("omits a blank state and snapshots the query without attaching credentials", async () => {
    injectSource()
    const query = { customerId: 8, status: "  " }
    const read = source.getRequests(query)
    query.customerId = 99
    const pending = firstValueFrom(read)
    const req = http.expectOne(r => r.url === url)
    expect(req.request.params.get("idCliente")).toBe("8")
    expect(req.request.params.has("estado")).toBe(false)
    expect(req.request.withCredentials).toBe(false)
    expect(req.request.headers.has("Authorization")).toBe(false)
    req.flush(page())
    expect((await pending).success).toBe(true)
  })

  it("keeps list and detail cold, cancellable and uncached across subscriptions", async () => {
    injectSource()
    for (const read of reads()) {
      http.expectNone(() => true)
      let delivered = false
      const subscription = read.subscribe(() => {
        delivered = true
      })
      const req = http.expectOne(() => true)
      expect(req.request.method).toBe("GET")
      subscription.unsubscribe()
      expect(req.cancelled).toBe(true)
      expect(delivered).toBe(false)
      const subscriptionAgain = read.subscribe()
      const second = http.expectOne(() => true)
      expect(second.request.urlWithParams).toBe(req.request.urlWithParams)
      subscriptionAgain.unsubscribe()
      expect(second.cancelled).toBe(true)
    }
  })

  it.each([
    [400, "INVALID_DATA"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [500, "UNAVAILABLE"],
    [503, "UNAVAILABLE"]
  ] as const)("maps HTTP %s safely without retrying either read", async (status, code) => {
    injectSource()
    for (const read of reads()) {
      const pending = firstValueFrom(read)
      http
        .expectOne(() => true)
        .flush(
          { mensaje: "PRIVATE BACKEND DETAIL", codigo: "INTERNAL" },
          { status, statusText: "PRIVATE TRANSPORT DETAIL" }
        )
      const result = await pending
      expect(result).toMatchObject({ success: false, error: { code } })
      if (!result.success) {
        expect(result.error.message).toBe("No se pudo consultar la solicitud de servicio.")
        expect(JSON.stringify(result.error)).not.toContain("PRIVATE")
      }
      http.expectNone(() => true)
    }
  })

  it("classifies a successful-status transport parse failure as INVALID_RESPONSE without retry", async () => {
    injectSource()
    const pending = firstValueFrom(source.getRequest(17))
    http.expectOne(`${url}/17`).error(new ProgressEvent("error"), { status: 200, statusText: "OK" })
    expect(await pending).toMatchObject({
      success: false,
      error: { code: "INVALID_RESPONSE", message: "No se pudo consultar la solicitud de servicio." }
    })
    http.expectNone(() => true)
  })

  it("maps a network failure to a safe UNAVAILABLE Result without retry", async () => {
    injectSource()
    const pending = firstValueFrom(source.getRequests({}))
    http.expectOne(r => r.url === url).error(new ProgressEvent("error"))
    expect(await pending).toMatchObject({
      success: false,
      error: { code: "UNAVAILABLE", message: "No se pudo consultar la solicitud de servicio." }
    })
    http.expectNone(() => true)
  })

  it.each([
    "not-a-url",
    "http://api.example.test",
    "https://api.example.test/path",
    "https://api.example.test?query=1",
    "https://api.example.test#fragment"
  ])("rejects an invalid configured API origin (%s) without HTTP", async value => {
    TestBed.overrideProvider(API_URL, { useValue: value })
    injectSource()
    for (const read of reads()) {
      expect(await firstValueFrom(read)).toMatchObject({
        success: false,
        error: { code: "UNCONFIGURED" }
      })
    }
    http.expectNone(() => true)
  })

  it("normalizes a valid API origin trailing slash without changing the endpoint", async () => {
    TestBed.overrideProvider(API_URL, { useValue: "https://api.example.test/" })
    injectSource()
    const pending = firstValueFrom(source.getRequest(17))
    http.expectOne(`${url}/17`).flush(dto)
    expect(await pending).toMatchObject({ success: true, data: summary })
  })

  it.each(["server", "unconfigured"])("does not dispatch reads when %s", async mode => {
    if (mode === "server") TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    else TestBed.overrideProvider(API_URL, { useValue: null })
    injectSource()
    const list = await firstValueFrom(source.getRequests({}))
    const detail = await firstValueFrom(source.getRequest(17))
    expect(list.success).toBe(false)
    expect(detail.success).toBe(false)
    http.expectNone(() => true)
  })
})
