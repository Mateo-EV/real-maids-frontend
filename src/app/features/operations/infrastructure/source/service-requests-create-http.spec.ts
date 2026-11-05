import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { CreateServiceRequestParams } from "../../domain/params/operations.params"
import { ServiceRequestsHttpSource } from "./service-requests-http.source"

const url = "https://api.example.test/api/solicitudes"
const input: CreateServiceRequestParams = {
  customerId: 8,
  propertyId: 31,
  serviceTypeId: 4,
  description: null,
  desiredDate: null
}
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
  registradoPor: "Actor del servidor",
  fechaRegistro: "2026-03-01T23:30:00-05:00",
  fechaActualizacion: null
}

describe("ServiceRequestsHttpSource create boundary", () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: API_URL, useValue: "https://api.example.test" }
      ]
    })
  )
  afterEach(() => TestBed.inject(HttpTestingController).verify())
  const source = () => TestBed.inject(ServiceRequestsHttpSource)
  const http = () => TestBed.inject(HttpTestingController)

  it("keeps POST cold, snapshots input and sends only documented fields before returning a validated server projection", async () => {
    const params = { ...input, status: "cancelada", registeredBy: 99 }
    const operation = source().createRequest(params)
    params.customerId = 99
    http().expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = http().expectOne(url)
    expect(request.request.method).toBe("POST")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.body).toEqual({
      idCliente: 8,
      idPropiedad: 31,
      idTipoServicio: 4,
      descripcion: null,
      fechaDeseada: null
    })
    request.flush(dto, { status: 201, statusText: "Created" })
    expect(await pending).toMatchObject({
      success: true,
      data: {
        id: 17,
        customerId: 8,
        propertyId: 31,
        serviceTypeId: 4,
        description: null,
        desiredDate: null,
        registeredByName: "Actor del servidor",
        registeredAt: new Date("2026-03-02T04:30:00Z"),
        updatedAt: null
      }
    })
    http().expectNone(() => true)
  })

  it("accepts documented ID/text/calendar boundaries without inventing actor, state or browser-day validation", async () => {
    const params = {
      customerId: 2147483647,
      propertyId: 2147483647,
      serviceTypeId: 2147483647,
      description: "x".repeat(2000),
      desiredDate: "2032-02-29"
    }
    const pending = firstValueFrom(source().createRequest(params))
    const request = http().expectOne(url)
    expect(request.request.body).toEqual({
      idCliente: 2147483647,
      idPropiedad: 2147483647,
      idTipoServicio: 2147483647,
      descripcion: params.description,
      fechaDeseada: "2032-02-29"
    })
    request.flush({
      ...dto,
      idCliente: params.customerId,
      idPropiedad: params.propertyId,
      idTipoServicio: params.serviceTypeId,
      descripcion: params.description,
      fechaDeseada: params.desiredDate
    })
    expect(await pending).toMatchObject({
      success: true,
      data: { description: params.description, desiredDate: params.desiredDate }
    })
  })

  const invalid: Record<string, unknown>[] = [
    { customerId: 0 },
    { customerId: 2147483648 },
    { propertyId: -1 },
    { propertyId: 2147483648 },
    { serviceTypeId: 0 },
    { serviceTypeId: 1.5 },
    { description: "x".repeat(2001) },
    { description: undefined },
    { description: 42 },
    { desiredDate: "2027-02-29" },
    { desiredDate: "2032-02-29T00:00:00Z" },
    { desiredDate: undefined }
  ]
  it.each(invalid)(
    "rejects invalid documented payload %j without HTTP or local allocation",
    async patch => {
      const result = await firstValueFrom(
        source().createRequest({ ...input, ...patch } as CreateServiceRequestParams)
      )
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      http().expectNone(() => true)
    }
  )

  it.each([{ idCliente: 9 }, { idPropiedad: 32 }, { idTipoServicio: 5 }, { registradoPor: null }])(
    "rejects malformed or wrong-reference create projection %j without replay",
    async patch => {
      const pending = firstValueFrom(source().createRequest(input))
      http()
        .expectOne(url)
        .flush({ ...dto, ...patch })
      const result = await pending
      expect(result).toMatchObject({
        success: false,
        error: { code: "INVALID_RESPONSE", message: "No se pudo crear la solicitud de servicio." }
      })
      http().expectNone(() => true)
    }
  )

  it("leaves business-clock validation to the backend and returns safe failure without retry", async () => {
    const pending = firstValueFrom(
      source().createRequest({ ...input, desiredDate: "2020-01-01", description: "" })
    )
    const request = http().expectOne(url)
    expect(request.request.body.fechaDeseada).toBe("2020-01-01")
    expect(request.request.body.descripcion).toBe("")
    request.flush({ mensaje: "PRIVATE BUSINESS CLOCK" }, { status: 400, statusText: "Bad Request" })
    expect(await pending).toMatchObject({
      success: false,
      error: { code: "INVALID_DATA", message: "No se pudo crear la solicitud de servicio." }
    })
    http().expectNone(() => true)
  })

  it("does not replay a forbidden non-idempotent POST or expose raw backend text", async () => {
    const pending = firstValueFrom(source().createRequest(input))
    http()
      .expectOne(url)
      .flush({ mensaje: "PRIVATE OWNER DETAIL" }, { status: 403, statusText: "Forbidden" })
    expect(await pending).toMatchObject({
      success: false,
      error: { code: "FORBIDDEN", message: "No se pudo crear la solicitud de servicio." }
    })
    http().expectNone(() => true)
  })

  it("forwards consumer cancellation without a success delivery or a replacement request", () => {
    const delivered = vi.fn()
    const subscription = source().createRequest(input).subscribe(delivered)
    const request = http().expectOne(url)
    subscription.unsubscribe()
    expect(request.cancelled).toBe(true)
    expect(delivered).not.toHaveBeenCalled()
    http().expectNone(() => true)
    // Cancelling HTTP observation does not certify rollback of dispatched backend effects.
  })

  it.each(["server", "unconfigured"] as const)(
    "dispatches no create for %s execution",
    async mode => {
      if (mode === "server") TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
      else TestBed.overrideProvider(API_URL, { useValue: null })
      expect(await firstValueFrom(source().createRequest(input))).toMatchObject({
        success: false,
        error: { code: "UNCONFIGURED" }
      })
      http().expectNone(() => true)
    }
  )
})
