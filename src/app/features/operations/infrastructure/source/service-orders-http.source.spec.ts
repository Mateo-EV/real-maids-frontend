import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideHttpClient, HttpClient, HttpErrorResponse } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom, throwError } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { provideOperationsRequestReads } from "../../operations.providers"
import { OPERATIONS_REPOSITORY } from "../../domain/repositories/operations.repository"
import { ServiceOrderQuery } from "../../domain/params/operations.params"
import {
  ListServiceOrdersUseCase,
  GetServiceOrderByIdUseCase
} from "../../application/use-cases/service-order-read.use-cases"
import { OperationsRepositoryImpl } from "../repositories/operations.repository-impl"
import { ServiceOrdersHttpSource } from "./service-orders-http.source"

const url = "https://api.example.test/api/ordenes"
const stamp = "2026-03-02T04:30:00-05:00"
const schedule = () => ({
  idProgramacion: 51,
  fecha: "2024-02-29",
  horaInicio: "08:15:00.123456789",
  horaFin: null,
  vigente: true,
  motivo: null,
  registradoPor: null,
  fechaRegistro: stamp
})
const order = (id = 17) => ({
  idOrden: id,
  codigo: "OS-2026-000017",
  estado: "PROGRAMADA",
  estadoNombre: "Programada",
  idSolicitud: 42,
  idCliente: 8,
  cliente: "Stored customer",
  idPropiedad: 31,
  propiedad: "Stored property",
  idTipoServicio: 4,
  tipoServicio: "Stored service",
  duracionEstimadaMinutos: 90,
  montoEstimado: 0,
  observacion: "  <b>Literal</b>  ",
  programacion: schedule(),
  asignados: [{ idPersonal: 21, nombre: "Stored staff", telefono: null, rol: "RESPONSABLE" }],
  fechaCreacion: stamp,
  fechaActualizacion: null
})
const property = () => ({
  idPropiedad: 31,
  idCliente: 8,
  alias: null,
  direccion: "Stored address",
  ciudad: null,
  estadoRegion: null,
  codigoPostal: null,
  areaM2: 12.5,
  numeroAmbientes: 0,
  numeroBanos: null,
  instruccionesAcceso: "SYNTHETIC ACCESS",
  codigoPuerta: "SYNTHETIC CODE",
  tieneMascotas: false,
  activo: false,
  fechaCreacion: stamp
})
const detail = () => ({
  orden: order(),
  propiedad: property(),
  historial: [
    {
      estado: "PROGRAMADA",
      estadoNombre: "Programada",
      usuario: "Stored actor",
      observacion: null,
      fecha: stamp
    }
  ],
  programaciones: [schedule()]
})
const page = (items = [order()], pagina = 0, tamanio = 2, total = items.length) => ({
  contenido: items,
  pagina,
  tamanio,
  totalElementos: total,
  totalPaginas: Math.ceil(total / tamanio)
})

function setup(server = false, api: string | null = "https://api.example.test") {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideOperationsRequestReads(),
      { provide: PLATFORM_ID, useValue: server ? "server" : "browser" },
      { provide: API_URL, useValue: api }
    ]
  })
  return {
    source: TestBed.inject(ServiceOrdersHttpSource),
    http: TestBed.inject(HttpTestingController),
    list: TestBed.inject(ListServiceOrdersUseCase),
    get: TestBed.inject(GetServiceOrderByIdUseCase)
  }
}
afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

describe("cold validated order reads through public DI/HTTP", () => {
  it("keeps the root repository alias and independently forwards list/detail use cases", async () => {
    const s = setup()
    expect(TestBed.inject(OPERATIONS_REPOSITORY)).toBe(TestBed.inject(OperationsRepositoryImpl))
    expect(TestBed.inject(OPERATIONS_REPOSITORY)).not.toBe(s.source)
    const listing = firstValueFrom(s.list.execute({}))
    const listRequest = s.http.expectOne(r => r.url === url)
    expect(listRequest.request.method).toBe("GET")
    expect(listRequest.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    expect(listRequest.request.params.get("pagina")).toBe("0")
    expect(listRequest.request.params.get("tamanio")).toBe("20")
    expect(listRequest.request.transferCache).toBe(false)
    listRequest.flush(page())
    expect(await listing).toMatchObject({ success: true, data: { total: 1, offset: 0, limit: 2 } })
    const reading = firstValueFrom(s.get.execute(17))
    const request = s.http.expectOne(url + "/17")
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    request.flush(detail())
    expect(await reading).toMatchObject({
      success: true,
      data: {
        order: {
          id: 17,
          code: "OS-2026-000017",
          status: "PROGRAMADA",
          statusName: "Programada",
          requestId: 42,
          customerId: 8,
          customerName: "Stored customer",
          propertyId: 31,
          propertyName: "Stored property",
          serviceTypeId: 4,
          serviceTypeName: "Stored service",
          estimatedDurationMinutes: 90,
          estimatedAmount: "0.00",
          observation: "  <b>Literal</b>  ",
          createdAt: new Date("2026-03-02T09:30:00Z"),
          updatedAt: null,
          schedule: {
            id: 51,
            date: "2024-02-29",
            startTime: "08:15:00.123456789",
            endTime: null,
            isCurrent: true,
            reasonName: null,
            registeredByName: null,
            registeredAt: new Date("2026-03-02T09:30:00Z")
          },
          assignedStaff: [{ staffId: 21, name: "Stored staff", phone: null, role: "RESPONSABLE" }]
        },
        property: {
          id: 31,
          customerId: 8,
          alias: null,
          address: "Stored address",
          city: null,
          region: null,
          postalCode: null,
          areaSquareMeters: "12.50",
          roomCount: 0,
          bathroomCount: null,
          accessInstructions: "SYNTHETIC ACCESS",
          doorCode: "SYNTHETIC CODE",
          hasPets: false,
          isActive: false,
          createdAt: new Date("2026-03-02T09:30:00Z")
        },
        statusHistory: [
          {
            status: "PROGRAMADA",
            statusName: "Programada",
            userName: "Stored actor",
            observation: null,
            occurredAt: new Date("2026-03-02T09:30:00Z")
          }
        ],
        schedules: [{ id: 51 }]
      }
    })
    s.http.expectNone(() => true)
  })

  it("captures cold queries, maps filters, adopts effective paging and preserves backend scope/order", async () => {
    const s = setup()
    const query = {
      offset: 400,
      limit: 200,
      customerId: 99,
      staffId: 88,
      status: "  programada  ",
      from: "2024-02-29",
      until: "2024-03-02"
    }
    const operation = s.source.getOrders(query)
    query.customerId = 77
    s.http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = s.http.expectOne(r => r.url === url)
    expect(request.request.params.keys().sort()).toEqual([
      "desde",
      "estado",
      "hasta",
      "idCliente",
      "idPersonal",
      "pagina",
      "tamanio"
    ])
    expect(
      Object.fromEntries(request.request.params.keys().map(k => [k, request.request.params.get(k)]))
    ).toEqual({
      desde: "2024-02-29",
      estado: "PROGRAMADA",
      hasta: "2024-03-02",
      idCliente: "99",
      idPersonal: "88",
      pagina: "2",
      tamanio: "200"
    })
    const items = Array.from({ length: 25 }, (_, i) => order(80 - i))
    request.flush(page(items, 2, 100, 225))
    const result = await pending
    expect(result).toMatchObject({ success: true, data: { offset: 200, limit: 100, total: 225 } })
    if (result.success) expect(result.data.items.map(v => v.id)).toEqual(items.map(v => v.idOrden))
    s.http.expectNone(() => true)
  })

  it("preserves nullable/empty fields and open supplied state/role codes without invented SQL identities", async () => {
    const s = setup(),
      body = detail()
    body.orden = { ...order(), estado: "FUTURE_STATE", montoEstimado: 99999999.99 }
    body.orden.asignados[0].rol = "FUTURE_ROLE"
    body.propiedad.instruccionesAcceso = ""
    const pending = firstValueFrom(s.source.getOrder(17))
    s.http.expectOne(url + "/17").flush(body)
    const result = await pending
    expect(result).toMatchObject({
      success: true,
      data: {
        order: {
          status: "FUTURE_STATE",
          estimatedAmount: "99999999.99",
          assignedStaff: [{ role: "FUTURE_ROLE" }]
        },
        property: { accessInstructions: "" }
      }
    })
    if (result.success)
      expect(Object.keys(result.data.statusHistory[0]).sort()).toEqual([
        "observation",
        "occurredAt",
        "status",
        "statusName",
        "userName"
      ])
    s.http.expectNone(() => true)
  })

  it.each([
    { offset: -1 },
    { offset: 1, limit: 20 },
    { limit: 0 },
    { limit: 2147483648 },
    { offset: 2147483648, limit: 1 },
    { customerId: 0 },
    { staffId: 1.5 },
    { from: "2025-02-29" },
    { until: "2024-13-01" },
    { from: "2024-03-02", until: "2024-03-01" },
    { status: 2 }
  ])("rejects invalid query %j before HTTP", async query => {
    const s = setup()
    expect(
      await firstValueFrom(s.source.getOrders(query as unknown as ServiceOrderQuery))
    ).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    s.http.expectNone(() => true)
  })

  it.each([0, -1, 1.5, 2147483648, Number.NaN])(
    "rejects invalid order ID %s before HTTP",
    async id => {
      const s = setup()
      expect(await firstValueFrom(s.source.getOrder(id))).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
      s.http.expectNone(() => true)
    }
  )

  it.each([
    "target",
    "property",
    "owner",
    "schedule-date",
    "schedule-clock",
    "duplicate-staff",
    "duplicate-schedule",
    "history-date",
    "negative-amount",
    "fractional-amount",
    "missing-order",
    "property-flag",
    "property-area",
    "timestamp-offset",
    "timestamp-calendar"
  ] as const)(
    "rejects malformed or cross-owner detail %s without a successful projection",
    async kind => {
      const s = setup(),
        body = detail()
      const changed: Record<string, unknown> = body
      if (kind === "target") body.orden.idOrden = 18
      if (kind === "property") body.propiedad.idPropiedad = 32
      if (kind === "owner") body.propiedad.idCliente = 9
      if (kind === "schedule-date") body.orden.programacion.fecha = "2025-02-29"
      if (kind === "schedule-clock") body.orden.programacion.horaInicio = "24:00"
      if (kind === "duplicate-staff") body.orden.asignados.push({ ...body.orden.asignados[0] })
      if (kind === "duplicate-schedule") body.programaciones.push(schedule())
      if (kind === "history-date") body.historial[0].fecha = "2025-02-29T10:00:00Z"
      if (kind === "negative-amount") body.orden.montoEstimado = -1
      if (kind === "fractional-amount") body.orden.montoEstimado = 1.001
      if (kind === "missing-order") delete changed["orden"]
      if (kind === "property-flag")
        (changed["propiedad"] as Record<string, unknown>)["activo"] = null
      if (kind === "property-area") body.propiedad.areaM2 = 0
      if (kind === "timestamp-offset") body.orden.fechaCreacion = "2026-03-02T04:30:00"
      if (kind === "timestamp-calendar") body.orden.fechaCreacion = "2025-02-29T04:30:00Z"
      const pending = firstValueFrom(s.source.getOrder(17))
      s.http.expectOne(url + "/17").flush(body)
      const result = await pending
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
      if (!result.success)
        expect(result.error.message).not.toMatch(/SYNTHETIC ACCESS|SYNTHETIC CODE/)
      s.http.expectNone(() => true)
    }
  )

  it.each(["duplicate", "page", "size", "total-pages", "length"] as const)(
    "rejects malformed page %s",
    async kind => {
      const s = setup(),
        body = page()
      if (kind === "duplicate") {
        body.contenido.push(order())
        body.totalElementos = 2
      }
      if (kind === "page") body.pagina = 1
      if (kind === "size") body.tamanio = 101
      if (kind === "total-pages") body.totalPaginas = 2
      if (kind === "length") body.totalElementos = 2
      const pending = firstValueFrom(s.source.getOrders())
      s.http.expectOne(r => r.url === url).flush(body)
      expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
      s.http.expectNone(() => true)
    }
  )

  it.each([
    [0, "UNAVAILABLE"],
    [400, "INVALID_DATA"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [500, "UNAVAILABLE"]
  ])("maps HTTP%s safely without retry", async (status, code) => {
    const s = setup(),
      pending = firstValueFrom(s.source.getOrder(17))
    const request = s.http.expectOne(url + "/17")
    if (status === 0) request.error(new ProgressEvent("error"))
    else
      request.flush({ mensaje: "RAW-SENSITIVE" }, { status: Number(status), statusText: "Failure" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    if (!result.success) expect(result.error.message).not.toContain("RAW-SENSITIVE")
    s.http.expectNone(() => true)
  })

  it("maps successful-status JSON parsing failures to INVALID_RESPONSE", async () => {
    const s = setup()
    vi.spyOn(TestBed.inject(HttpClient), "get").mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 200, error: new SyntaxError("RAW") }))
    )
    expect(await firstValueFrom(s.source.getOrder(17))).toMatchObject({
      success: false,
      error: { code: "INVALID_RESPONSE" }
    })
    s.http.expectNone(() => true)
  })

  it.each(["server", "unconfigured"] as const)(
    "dispatches no %s HTTP or demo fallback",
    async mode => {
      const s = setup(mode === "server", mode === "unconfigured" ? null : undefined)
      expect(await firstValueFrom(s.source.getOrders())).toMatchObject({
        success: false,
        error: { code: "UNCONFIGURED" }
      })
      expect(await firstValueFrom(s.source.getOrder(17))).toMatchObject({
        success: false,
        error: { code: "UNCONFIGURED" }
      })
      s.http.expectNone(() => true)
    }
  )

  it("cancels a caller read, does not cache or retry and preserves a fresh explicit read", async () => {
    const s = setup(),
      sub = s.source.getOrder(17).subscribe()
    const abandoned = s.http.expectOne(url + "/17")
    sub.unsubscribe()
    expect(abandoned.cancelled).toBe(true)
    s.http.expectNone(() => true)
    const pending = firstValueFrom(s.source.getOrder(17))
    s.http.expectOne(url + "/17").flush(detail())
    expect((await pending).success).toBe(true)
    s.http.expectNone(() => true)
  })
})
