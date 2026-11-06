import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { HttpClient, HttpErrorResponse, provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom, throwError } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { CreateServiceOrderParams } from "../../domain/params/operations.params"
import { CreateServiceOrderUseCase } from "../../application/use-cases/service-order-write.use-cases"
import { provideOperationsRequestReads } from "../../operations.providers"
import { ServiceOrdersHttpSource } from "./service-orders-http.source"

const url = "https://api.example.test/api/ordenes"
const input = { requestId: 42, estimatedAmount: "123.45", observation: "  <b>Literal</b>  " }
const detail = (amount: number | null = 123.45) => ({
  orden: {
    idOrden: 17,
    codigo: "OS-2026-000017",
    estado: "PENDIENTE",
    estadoNombre: "Pendiente",
    idSolicitud: 42,
    idCliente: 8,
    cliente: "Stored customer",
    idPropiedad: 31,
    propiedad: "Stored property",
    idTipoServicio: 4,
    tipoServicio: "Stored service",
    duracionEstimadaMinutos: 90,
    montoEstimado: amount,
    observacion: null,
    programacion: null,
    asignados: [],
    fechaCreacion: "2026-03-02T04:30:00Z",
    fechaActualizacion: null
  },
  propiedad: {
    idPropiedad: 31,
    idCliente: 8,
    alias: null,
    direccion: "Stored address",
    ciudad: null,
    estadoRegion: null,
    codigoPostal: null,
    areaM2: null,
    numeroAmbientes: null,
    numeroBanos: null,
    instruccionesAcceso: "SYNTHETIC ACCESS",
    codigoPuerta: "SYNTHETIC CODE",
    tieneMascotas: false,
    activo: true,
    fechaCreacion: "2026-03-02T04:30:00Z"
  },
  historial: [],
  programaciones: []
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
    action: TestBed.inject(CreateServiceOrderUseCase),
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

describe("explicit cold creation of an order from a request", () => {
  it("captures only the three documented fields through root repository/use case without preflight", async () => {
    const s = setup(),
      params = { ...input, customerId: 99, propertyId: 999, status: "PAGADO" }
    const operation = s.action.execute(params)
    params.requestId = 99
    params.estimatedAmount = "1"
    params.observation = "Later mutation"
    s.http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = s.http.expectOne(r => r.url === url && r.method === "POST")
    expect(request.request.body).toEqual({
      idSolicitud: 42,
      montoEstimado: 123.45,
      observacion: "  <b>Literal</b>  "
    })
    expect(request.request.transferCache).toBe(false)
    s.http.expectNone(() => true)
    request.flush(detail(), { status: 201, statusText: "Created" })
    expect(await pending).toMatchObject({
      success: true,
      data: {
        order: {
          id: 17,
          requestId: 42,
          status: "PENDIENTE",
          estimatedAmount: "123.45",
          customerId: 8,
          propertyId: 31,
          observation: null
        },
        property: { id: 31, customerId: 8 }
      }
    })
    s.http.expectNone(() => true)
  })

  it.each([
    [null, null],
    ["0", 0],
    ["0.00", 0],
    ["1.2", 1.2],
    ["000123.45", 123.45],
    ["99999999.99", 99999999.99]
  ] as const)(
    "transports bounded nullable decimal %s as the documented JSON number/null",
    async (amount, expected) => {
      const s = setup(),
        pending = firstValueFrom(
          s.source.createOrder({ requestId: 42, estimatedAmount: amount, observation: null })
        )
      const request = s.http.expectOne(url)
      expect(request.request.method).toBe("POST")
      expect(request.request.body).toEqual({
        idSolicitud: 42,
        montoEstimado: expected,
        observacion: null
      })
      request.flush(detail(expected))
      expect((await pending).success).toBe(true)
      s.http.expectNone(() => true)
    }
  )

  it.each([0, -1, 1.5, 2147483648, NaN, "42"])(
    "rejects invalid request ID %s before HTTP",
    async requestId => {
      const s = setup()
      expect(
        await firstValueFrom(
          s.source.createOrder({ ...input, requestId } as unknown as CreateServiceOrderParams)
        )
      ).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      s.http.expectNone(() => true)
    }
  )

  it.each([
    "",
    "-1",
    "1.001",
    "100000000",
    "Infinity",
    "NaN",
    "1e2",
    "1,20",
    " 1.20 ",
    12,
    undefined
  ])("rejects invalid amount %s without dispatch or inferred defaults", async estimatedAmount => {
    const s = setup()
    expect(
      await firstValueFrom(
        s.source.createOrder({ ...input, estimatedAmount } as unknown as CreateServiceOrderParams)
      )
    ).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    s.http.expectNone(() => true)
  })

  it("preserves empty/max-length observation bytes and rejects a longer value", async () => {
    const s = setup()
    for (const observation of ["", " ".repeat(2000)]) {
      const pending = firstValueFrom(s.source.createOrder({ ...input, observation }))
      const request = s.http.expectOne(url)
      expect(request.request.body.observacion).toBe(observation)
      request.flush(detail())
      expect((await pending).success).toBe(true)
      s.http.expectNone(() => true)
    }
    expect(
      await firstValueFrom(s.source.createOrder({ ...input, observation: "x".repeat(2001) }))
    ).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    s.http.expectNone(() => true)
  })

  it.each([null, undefined, [], { ...input, observation: undefined }])(
    "captures malformed payload %j without synchronous throw",
    async params => {
      const s = setup()
      let operation: ReturnType<ServiceOrdersHttpSource["createOrder"]> | undefined
      expect(() => {
        operation = s.source.createOrder(params as unknown as CreateServiceOrderParams)
      }).not.toThrow()
      expect(await firstValueFrom(operation!)).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
      s.http.expectNone(() => true)
    }
  )

  it("captures a throwing getter as invalid data, not a synchronous exception or write", async () => {
    const s = setup()
    const params = {
      ...input,
      get requestId(): number {
        throw Error("RAW")
      }
    }
    let operation: ReturnType<ServiceOrdersHttpSource["createOrder"]> | undefined
    expect(() => {
      operation = s.source.createOrder(params)
    }).not.toThrow()
    expect(await firstValueFrom(operation!)).toMatchObject({
      success: false,
      error: { code: "INVALID_DATA" }
    })
    s.http.expectNone(() => true)
  })

  it.each(["request", "state", "target", "owner", "property", "malformed"] as const)(
    "rejects inconsistent created response %s without exposing access values",
    async kind => {
      const s = setup(),
        body = detail()
      if (kind === "request") body.orden.idSolicitud = 99
      if (kind === "state") body.orden.estado = "PROGRAMADA"
      if (kind === "target") body.orden.idOrden = 0
      if (kind === "owner") body.propiedad.idCliente = 9
      if (kind === "property") body.propiedad.idPropiedad = 32
      if (kind === "malformed") (body as Record<string, unknown>)["historial"] = null
      const pending = firstValueFrom(s.source.createOrder(input))
      s.http.expectOne(url).flush(body)
      const result = await pending
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
      if (!result.success)
        expect(result.error.message).not.toMatch(/SYNTHETIC ACCESS|SYNTHETIC CODE/)
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
  ])("maps HTTP%s safely with no automatic replay", async (status, code) => {
    const s = setup(),
      pending = firstValueFrom(s.source.createOrder(input))
    const request = s.http.expectOne(url)
    if (status === 0) request.error(new ProgressEvent("error"))
    else
      request.flush({ mensaje: "RAW-SENSITIVE" }, { status: Number(status), statusText: "Failure" })
    const result = await pending
    expect(result).toMatchObject({
      success: false,
      error: { code, message: "No se pudo crear la orden de servicio." }
    })
    s.http.expectNone(() => true)
  })

  it("keeps parse-200 failures INVALID_RESPONSE and action-local without a fabricated success", async () => {
    const s = setup()
    vi.spyOn(TestBed.inject(HttpClient), "post").mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 200, error: new SyntaxError("RAW") }))
    )
    expect(await firstValueFrom(s.source.createOrder(input))).toMatchObject({
      success: false,
      error: { code: "INVALID_RESPONSE", message: "No se pudo crear la orden de servicio." }
    })
    s.http.expectNone(() => true)
  })

  it("makes repeat subscriptions explicit separate writes, and cancellation never schedules a replay", async () => {
    const s = setup(),
      operation = s.source.createOrder(input)
    const first = firstValueFrom(operation)
    s.http.expectOne(url).flush(detail())
    expect((await first).success).toBe(true)
    const second = firstValueFrom(operation)
    const rejected = s.http.expectOne(url)
    expect(rejected.request.method).toBe("POST")
    rejected.flush({}, { status: 409, statusText: "Conflict" })
    expect(await second).toMatchObject({ success: false, error: { code: "CONFLICT" } })
    const sub = operation.subscribe()
    const abandoned = s.http.expectOne(url)
    sub.unsubscribe()
    expect(abandoned.cancelled).toBe(true)
    s.http.expectNone(() => true)
  })

  it.each(["server", "unconfigured"] as const)(
    "dispatches no %s order write or fallback",
    async mode => {
      const s = setup(mode === "server", mode === "unconfigured" ? null : undefined)
      expect(await firstValueFrom(s.source.createOrder(input))).toMatchObject({
        success: false,
        error: { code: "UNCONFIGURED" }
      })
      s.http.expectNone(() => true)
    }
  )
})
