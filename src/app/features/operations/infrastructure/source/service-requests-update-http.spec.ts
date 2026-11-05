import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { UpdateServiceRequestParams } from "../../domain/params/operations.params"
import { ServiceRequestsHttpSource } from "./service-requests-http.source"

const url = "https://api.example.test/api/solicitudes/17"
const input: UpdateServiceRequestParams = {
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
const message = "No se pudo actualizar la solicitud de servicio."

describe("ServiceRequestsHttpSource update boundary", () => {
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

  it("keeps PUT cold, captures input and sends exactly four replacement fields without preflight GET", async () => {
    const params = { ...input, customerId: 99, status: "cancelada", registeredBy: 999 }
    const operation = source().updateRequest(17, params)
    params.propertyId = 32
    params.serviceTypeId = 5
    params.description = "Changed after capture"
    http().expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = http().expectOne(url)
    expect(request.request.method).toBe("PUT")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.body).toEqual({
      idPropiedad: 31,
      idTipoServicio: 4,
      descripcion: null,
      fechaDeseada: null
    })
    request.flush(dto)
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

  it("accepts positive int32 and text/calendar boundaries, preserving literal text and returned customer identity", async () => {
    const params = {
      propertyId: 2147483647,
      serviceTypeId: 2147483647,
      description: "x".repeat(2000),
      desiredDate: "2032-02-29"
    }
    const pending = firstValueFrom(source().updateRequest(2147483647, params))
    const request = http().expectOne("https://api.example.test/api/solicitudes/2147483647")
    expect(request.request.method).toBe("PUT")
    expect(request.request.body).toEqual({
      idPropiedad: params.propertyId,
      idTipoServicio: params.serviceTypeId,
      descripcion: params.description,
      fechaDeseada: params.desiredDate
    })
    request.flush({
      ...dto,
      idSolicitud: 2147483647,
      idCliente: 9,
      idPropiedad: params.propertyId,
      idTipoServicio: params.serviceTypeId,
      descripcion: params.description,
      fechaDeseada: params.desiredDate,
      fechaActualizacion: "2026-03-02T00:00:00-05:00"
    })
    expect(await pending).toMatchObject({
      success: true,
      data: {
        customerId: 9,
        description: params.description,
        desiredDate: params.desiredDate,
        updatedAt: new Date("2026-03-02T05:00:00Z")
      }
    })
    http().expectNone(() => true)
  })

  it("allows an unchanged past desired date and a no-op server response without local clock or active-reference lookups", async () => {
    const pending = firstValueFrom(
      source().updateRequest(17, { ...input, description: "", desiredDate: "2020-01-01" })
    )
    const request = http().expectOne(url)
    expect(request.request.body.descripcion).toBe("")
    expect(request.request.body.fechaDeseada).toBe("2020-01-01")
    request.flush({ ...dto, descripcion: "", fechaDeseada: "2020-01-01" })
    expect(await pending).toMatchObject({
      success: true,
      data: { description: "", desiredDate: "2020-01-01", updatedAt: null }
    })
    http().expectNone(() => true)
  })

  it.each([0, -1, 1.5, 2147483648, NaN, Infinity])(
    "rejects invalid target %s with zero HTTP",
    async id => {
      expect(await firstValueFrom(source().updateRequest(id, input))).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA", message }
      })
      http().expectNone(() => true)
    }
  )

  const invalid: Record<string, unknown>[] = [
    { propertyId: 0 },
    { propertyId: -1 },
    { propertyId: 2147483648 },
    { propertyId: null },
    { propertyId: undefined },
    { serviceTypeId: 0 },
    { serviceTypeId: 1.5 },
    { serviceTypeId: 2147483648 },
    { serviceTypeId: "4" },
    { serviceTypeId: null },
    { description: "x".repeat(2001) },
    { description: undefined },
    { description: 42 },
    { desiredDate: "2027-02-29" },
    { desiredDate: "2032-02-30" },
    { desiredDate: "2032-13-01" },
    { desiredDate: "2032-01-00" },
    { desiredDate: "2032-2-29" },
    { desiredDate: "2032-02-29T00:00:00Z" },
    { desiredDate: "" },
    { desiredDate: undefined },
    { desiredDate: 42 }
  ]
  it.each(invalid)("rejects invalid replacement %j without HTTP", async patch => {
    expect(
      await firstValueFrom(
        source().updateRequest(17, { ...input, ...patch } as UpdateServiceRequestParams)
      )
    ).toMatchObject({ success: false, error: { code: "INVALID_DATA", message } })
    http().expectNone(() => true)
  })

  it.each([
    { idSolicitud: 18 },
    { idPropiedad: 32 },
    { idTipoServicio: 5 },
    { idCliente: 0 },
    { cliente: null },
    { registradoPor: null },
    { estado: "unknown" },
    { fechaDeseada: "2027-02-29" },
    { fechaRegistro: "2026-03-01T23:30:00" },
    { fechaActualizacion: "invalid" },
    { descripcion: 42 }
  ])(
    "rejects malformed/wrong-target or wrong-reference projection %j without replay",
    async patch => {
      const pending = firstValueFrom(source().updateRequest(17, input))
      http()
        .expectOne(url)
        .flush({ ...dto, ...patch })
      expect(await pending).toMatchObject({
        success: false,
        error: { code: "INVALID_RESPONSE", message }
      })
      http().expectNone(() => true)
    }
  )

  it.each([
    [400, "INVALID_DATA"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [500, "UNAVAILABLE"]
  ] as const)("maps HTTP %s safely without PUT retry", async (status, code) => {
    const pending = firstValueFrom(source().updateRequest(17, input))
    const request = http().expectOne(url)
    expect(request.request.method).toBe("PUT")
    request.flush({ mensaje: "PRIVATE BACKEND DETAIL" }, { status, statusText: "Failure" })
    expect(await pending).toMatchObject({ success: false, error: { code, message } })
    http().expectNone(() => true)
  })

  it("maps network failure safely without automatic replay", async () => {
    const pending = firstValueFrom(source().updateRequest(17, input))
    http().expectOne(url).error(new ProgressEvent("error"))
    expect(await pending).toMatchObject({
      success: false,
      error: { code: "UNAVAILABLE", message }
    })
    http().expectNone(() => true)
  })

  it("forwards consumer cancellation without success delivery or another request", () => {
    const delivered = vi.fn()
    const subscription = source().updateRequest(17, input).subscribe(delivered)
    try {
      const request = http().expectOne(url)
      subscription.unsubscribe()
      expect(request.cancelled).toBe(true)
      expect(delivered).not.toHaveBeenCalled()
      http().expectNone(() => true)
    } finally {
      subscription.unsubscribe()
    }
    // Unsubscribing does not certify rollback of a dispatched backend write.
  })

  it.each(["server", "unconfigured"] as const)("dispatches no update for %s", async mode => {
    if (mode === "server") TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    else TestBed.overrideProvider(API_URL, { useValue: null })
    expect(await firstValueFrom(source().updateRequest(17, input))).toMatchObject({
      success: false,
      error: { code: "UNCONFIGURED", message }
    })
    http().expectNone(() => true)
  })
})
