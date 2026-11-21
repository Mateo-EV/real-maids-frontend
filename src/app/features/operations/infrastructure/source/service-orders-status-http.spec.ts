import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ChangeOrderStatusParams } from "../../domain/params/operations.params"
import { provideOperationsRequestReads } from "../../operations.providers"
import { ServiceOrdersHttpSource } from "./service-orders-http.source"

const ordersUrl = "https://api.example.test/api/ordenes"
const statusUrl = `${ordersUrl}/17/estado`
const stamp = "2026-03-02T04:30:00-05:00"
const raw = "RAW-SENSITIVE"

const schedule = () => ({
  idProgramacion: 51,
  fecha: "2024-02-29",
  horaInicio: "08:15:00",
  horaFin: "09:45:00",
  vigente: true,
  motivo: null,
  registradoPor: "Stored actor",
  fechaRegistro: stamp
})
const orderDto = () => ({
  idOrden: 17,
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
  asignados: [],
  fechaCreacion: stamp,
  fechaActualizacion: null
})
const propertyDto = () => ({
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
  instruccionesAcceso: null,
  codigoPuerta: null,
  tieneMascotas: false,
  activo: true,
  fechaCreacion: stamp
})
const detailDto = () => ({
  orden: orderDto(),
  propiedad: propertyDto(),
  historial: [
    {
      estado: "PROGRAMADA",
      estadoNombre: "Programada",
      usuario: "Stored actor",
      observacion: "Stored note",
      fecha: stamp
    }
  ],
  programaciones: [schedule()]
})

const params = (): ChangeOrderStatusParams => ({ status: "EN_PROCESO", observation: "  " })

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
    http: TestBed.inject(HttpTestingController)
  }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

describe("WP11 S1/S2 cold order-status PATCH", () => {
  it("sends one cold PATCH with only status and a blank observation as null", async () => {
    const s = setup()
    const input = params()
    const operation = s.source.changeOrderStatus(17, input)
    input.status = "CANCELADA"
    input.observation = "mutated"
    s.http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = s.http.expectOne(statusUrl)
    expect(request.request.method).toBe("PATCH")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.body).toEqual({ estado: "EN_PROCESO", observacion: null })
    s.http.expectNone(() => true)
    request.flush(detailDto())
    expect(await pending).toMatchObject({
      success: true,
      data: {
        order: { id: 17, status: "PROGRAMADA", statusName: "Programada" },
        property: { id: 31, customerId: 8, address: "Stored address" },
        statusHistory: [{ status: "PROGRAMADA", observation: "Stored note" }],
        schedules: [{ id: 51, date: "2024-02-29" }]
      }
    })
    s.http.expectNone(() => true)
  })

  it("keeps a supplied observation literal and decodes the full order-detail envelope", async () => {
    const s = setup()
    const pending = firstValueFrom(
      s.source.changeOrderStatus(17, { status: "COMPLETADA", observation: "  <b>Done</b>  " })
    )
    const request = s.http.expectOne(statusUrl)
    expect(request.request.body).toEqual({
      estado: "COMPLETADA",
      observacion: "  <b>Done</b>  "
    })
    request.flush(detailDto())
    const result = await pending
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.property.accessInstructions).toBeNull()
    s.http.expectNone(() => true)
  })

  it.each(["", "  ", "pendiente2", "EN PAUSA", null, 7])(
    "rejects unknown or empty status %j without HTTP",
    async status => {
      const s = setup()
      const result = await firstValueFrom(
        s.source.changeOrderStatus(17, { status: status as unknown as string, observation: null })
      )
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      s.http.expectNone(() => true)
    }
  )

  it("rejects a non-string observation without HTTP", async () => {
    const s = setup()
    const result = await firstValueFrom(
      s.source.changeOrderStatus(17, {
        status: "PENDIENTE",
        observation: 12 as unknown as string
      })
    )
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    s.http.expectNone(() => true)
  })

  it("accepts an observation of exactly 250 characters", async () => {
    const s = setup()
    const pending = firstValueFrom(
      s.source.changeOrderStatus(17, { status: "PAGADO", observation: "x".repeat(250) })
    )
    const request = s.http.expectOne(statusUrl)
    expect(request.request.body).toEqual({ estado: "PAGADO", observacion: "x".repeat(250) })
    request.flush(detailDto())
    expect((await pending).success).toBe(true)
    s.http.expectNone(() => true)
  })

  it("rejects a 251-character observation before HTTP", async () => {
    const s = setup()
    const rejected = await firstValueFrom(
      s.source.changeOrderStatus(17, { status: "PAGADO", observation: "x".repeat(251) })
    )
    expect(rejected).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    s.http.expectNone(() => true)
  })

  it.each([0, -1, 1.5, 2147483648, NaN, Infinity])(
    "rejects invalid order int32 %s safely before HTTP",
    async id => {
      const s = setup()
      const result = await firstValueFrom(s.source.changeOrderStatus(id, params()))
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      s.http.expectNone(() => true)
    }
  )

  it("captures throwing getters without a synchronous exception or HTTP", async () => {
    const s = setup()
    const input = {
      get status(): string {
        throw Error(raw)
      },
      observation: null
    } as ChangeOrderStatusParams
    let operation: ReturnType<ServiceOrdersHttpSource["changeOrderStatus"]> | undefined
    expect(() => {
      operation = s.source.changeOrderStatus(17, input)
    }).not.toThrow()
    if (!operation) throw Error("Missing status observable")
    const result = await firstValueFrom(operation)
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    if (!result.success) expect(result.error.message).not.toContain(raw)
    s.http.expectNone(() => true)
  })

  it.each([
    [{ ...detailDto(), orden: { ...orderDto(), idOrden: 18 } }, "INVALID_RESPONSE"],
    [{ ...detailDto(), propiedad: { ...propertyDto(), idCliente: 9 } }, "INVALID_RESPONSE"],
    [null, "INVALID_RESPONSE"],
    [raw, "INVALID_RESPONSE"],
    [{}, "INVALID_RESPONSE"]
  ])("rejects malformed detail %j as %s", async (body, code) => {
    const s = setup()
    const pending = firstValueFrom(s.source.changeOrderStatus(17, params()))
    s.http.expectOne(statusUrl).flush(body)
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    if (!result.success) expect(result.error.message).not.toContain(raw)
    s.http.expectNone(() => true)
  })

  it.each([
    [400, "INVALID_DATA"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [500, "UNAVAILABLE"]
  ] as const)("maps HTTP %s to %s without retry", async (status, code) => {
    const s = setup()
    const pending = firstValueFrom(s.source.changeOrderStatus(17, params()))
    s.http.expectOne(statusUrl).flush({ mensaje: raw }, { status, statusText: "Failure" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    if (!result.success) expect(result.error.message).not.toContain(raw)
    s.http.expectNone(() => true)
  })

  it("maps a network failure to a typed UNAVAILABLE error without retry", async () => {
    const s = setup()
    const pending = firstValueFrom(s.source.changeOrderStatus(17, params()))
    s.http.expectOne(statusUrl).error(new ProgressEvent("error"))
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "UNAVAILABLE" } })
    s.http.expectNone(() => true)
  })

  it.each([
    ["server", true, "https://api.example.test"],
    ["unconfigured", false, null]
  ] as const)("dispatches no %s status request", async (_label, server, api) => {
    const s = setup(server, api)
    const result = await firstValueFrom(s.source.changeOrderStatus(17, params()))
    expect(result).toMatchObject({ success: false, error: { code: "UNCONFIGURED" } })
    s.http.expectNone(() => true)
  })

  it("keeps cancellation caller-owned with no synthetic completion or replay", () => {
    const s = setup()
    const delivered = vi.fn()
    const subscription = s.source.changeOrderStatus(17, params()).subscribe(delivered)
    try {
      const request = s.http.expectOne(statusUrl)
      subscription.unsubscribe()
      expect(request.cancelled).toBe(true)
      expect(delivered).not.toHaveBeenCalled()
      s.http.expectNone(() => true)
    } finally {
      subscription.unsubscribe()
    }
  })
})
