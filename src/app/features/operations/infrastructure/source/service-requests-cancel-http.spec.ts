import { HttpClient, HttpErrorResponse, provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, throwError } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { CancelServiceRequestParams } from "../../domain/params/operations.params"
import { ServiceRequestsHttpSource } from "./service-requests-http.source"

const base = "https://api.example.test/api/solicitudes"
const url = `${base}/17/cancelacion`
const message = "No se pudo cancelar la solicitud de servicio."
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
  estado: "cancelada",
  registradoPor: "Actor suministrado",
  fechaRegistro: "2026-03-01T23:30:00-05:00",
  fechaActualizacion: "2026-03-02T00:00:00-05:00"
}

// T5/S1-S4, L164: irreversible, registered-only server cancellation; no idempotency promise.
describe("ServiceRequestsHttpSource cancellation boundary", () => {
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
  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController).verify()
    } finally {
      vi.restoreAllMocks()
    }
  })
  const source = () => TestBed.inject(ServiceRequestsHttpSource)
  const http = () => TestBed.inject(HttpTestingController)

  it("captures the original target/reason, stays cold and posts only trimmed motivo without preflight", async () => {
    let id = 17
    const params = {
      reason: "  Cambio de planes\n",
      status: "registrada",
      customerId: 99,
      actorId: 5
    }
    const operation = source().cancelRequest(id, params)
    id = 18
    params.reason = "Alterado después de capturar"
    http().expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = http().expectOne(url)
    expect(request.request.method).toBe("POST")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.body).toEqual({ motivo: "Cambio de planes" })
    expect(id).toBe(18)
    request.flush(dto)
    expect(await pending).toMatchObject({
      success: true,
      data: {
        id: 17,
        customerId: 8,
        propertyId: 31,
        serviceTypeId: 4,
        status: "cancelada",
        description: null,
        desiredDate: null,
        registeredByName: "Actor suministrado",
        registeredAt: new Date("2026-03-02T04:30:00Z"),
        updatedAt: new Date("2026-03-02T05:00:00Z")
      }
    })
    http().expectNone(() => true)
  })

  it.each([
    [1, "x"],
    [2147483647, "x".repeat(250)],
    [17, `  ${"x".repeat(250)}  `]
  ] as const)("accepts target %s and trimmed 1..250-character reason", async (id, reason) => {
    const pending = firstValueFrom(source().cancelRequest(id, { reason }))
    const request = http().expectOne(`${base}/${id}/cancelacion`)
    expect(request.request.method).toBe("POST")
    expect(request.request.body).toEqual({ motivo: reason.trim() })
    request.flush({
      ...dto,
      idSolicitud: id,
      descripcion: "  Literal  ",
      fechaDeseada: "2032-02-29"
    })
    expect(await pending).toMatchObject({
      success: true,
      data: { id, status: "cancelada", description: "  Literal  ", desiredDate: "2032-02-29" }
    })
    http().expectNone(() => true)
  })

  it.each([0, -1, 1.5, 2147483648, NaN, Infinity, null, undefined, "17", true])(
    "rejects invalid target %s with a safe Result and zero HTTP",
    async id => {
      expect(
        await firstValueFrom(source().cancelRequest(id as number, { reason: "Motivo" }))
      ).toMatchObject({ success: false, error: { code: "INVALID_DATA", message } })
      http().expectNone(() => true)
    }
  )

  it.each(
    [
      null,
      undefined,
      "Motivo",
      42,
      [],
      {},
      { reason: null },
      { reason: undefined },
      { reason: 42 },
      { reason: false },
      { reason: [] },
      { reason: {} },
      { reason: "" },
      { reason: " \n\t " },
      { reason: "x".repeat(251) },
      { reason: `  ${"x".repeat(251)}  ` }
    ].map(params => ({ params }))
  )("rejects malformed reason input %j without throwing or dispatching", async ({ params }) => {
    expect(
      await firstValueFrom(
        source().cancelRequest(17, params as unknown as CancelServiceRequestParams)
      )
    ).toMatchObject({ success: false, error: { code: "INVALID_DATA", message } })
    http().expectNone(() => true)
  })

  it.each(
    [
      null,
      [],
      {},
      { ...dto, idSolicitud: 18 },
      { ...dto, idSolicitud: "17" },
      { ...dto, estado: "registrada" },
      { ...dto, estado: "atendida" },
      { ...dto, estado: "CANCELADA" },
      { ...dto, estado: "unknown" },
      { ...dto, idCliente: 0 },
      { ...dto, cliente: null },
      { ...dto, idPropiedad: -1 },
      { ...dto, propiedad: null },
      { ...dto, idTipoServicio: 2147483648 },
      { ...dto, tipoServicio: "" },
      { ...dto, registradoPor: null },
      { ...dto, descripcion: 42 },
      { ...dto, fechaDeseada: "2027-02-29" },
      { ...dto, fechaRegistro: "2026-03-01T23:30:00" },
      { ...dto, fechaActualizacion: "invalid" }
    ].map(response => ({ response }))
  )(
    "requires the existing strict DTO, matching target and cancelada state: %j",
    async ({ response }) => {
      const pending = firstValueFrom(source().cancelRequest(17, { reason: "Motivo" }))
      http().expectOne(url).flush(response)
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
    [405, "UNKNOWN"],
    [409, "CONFLICT"],
    [500, "UNAVAILABLE"],
    [503, "UNAVAILABLE"]
  ] as const)("maps HTTP %s to a safe action-local error without retry", async (status, code) => {
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")]
    const pending = firstValueFrom(source().cancelRequest(17, { reason: "Motivo" }))
    const request = http().expectOne(url)
    request.flush(
      { mensaje: "PRIVATE BACKEND DETAIL", errores: ["PRIVATE"] },
      { status, statusText: "Failure" }
    )
    expect(await pending).toMatchObject({ success: false, error: { code, message } })
    for (const log of logs) expect(log).not.toHaveBeenCalled()
    http().expectNone(() => true)
  })

  it("maps a successful-status JSON parse failure without leaking the parser message", async () => {
    vi.spyOn(TestBed.inject(HttpClient), "post").mockReturnValue(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 200,
            statusText: "OK",
            url,
            error: new SyntaxError("PRIVATE PARSER DETAIL")
          })
      )
    )
    expect(await firstValueFrom(source().cancelRequest(17, { reason: "Motivo" }))).toMatchObject({
      success: false,
      error: { code: "INVALID_RESPONSE", message }
    })
    expect(TestBed.inject(HttpClient).post).toHaveBeenCalledTimes(1)
    http().expectNone(() => true)
  })

  it("maps network failure without automatic replay or a rollback promise", async () => {
    const pending = firstValueFrom(source().cancelRequest(17, { reason: "Motivo" }))
    http().expectOne(url).error(new ProgressEvent("error"))
    expect(await pending).toMatchObject({ success: false, error: { code: "UNAVAILABLE", message } })
    http().expectNone(() => true)
  })

  it("creates one independent write per explicit subscription and does not assume an idempotent repeat", async () => {
    const operation = source().cancelRequest(17, { reason: "Motivo" })
    http().expectNone(() => true)
    const first = firstValueFrom(operation)
    http().expectOne(url).flush(dto)
    expect(await first).toMatchObject({ success: true })
    http().expectNone(() => true)
    const second = firstValueFrom(operation)
    http()
      .expectOne(url)
      .flush({ mensaje: "Already cancelled" }, { status: 400, statusText: "Bad Request" })
    expect(await second).toMatchObject({ success: false, error: { code: "INVALID_DATA", message } })
    http().expectNone(() => true)
  })

  it("forwards unsubscribe without a completion Result or another POST", () => {
    const delivered = vi.fn()
    const subscription = source().cancelRequest(17, { reason: "Motivo" }).subscribe(delivered)
    try {
      const request = http().expectOne(url)
      subscription.unsubscribe()
      expect(request.cancelled).toBe(true)
      expect(delivered).not.toHaveBeenCalled()
      http().expectNone(() => true)
    } finally {
      subscription.unsubscribe()
    }
    // Transport cancellation cannot prove rollback of a dispatched backend write.
  })

  it.each(["server", "unconfigured"] as const)("dispatches no cancellation for %s", async mode => {
    if (mode === "server") TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    else TestBed.overrideProvider(API_URL, { useValue: null })
    expect(await firstValueFrom(source().cancelRequest(17, { reason: "Motivo" }))).toMatchObject({
      success: false,
      error: { code: "UNCONFIGURED", message }
    })
    http().expectNone(() => true)
  })
})
