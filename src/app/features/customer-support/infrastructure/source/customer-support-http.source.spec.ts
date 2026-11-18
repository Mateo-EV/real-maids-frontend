import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { Result } from "@/app/shared/utils/result"
import { CustomerSupportError } from "../../domain/errors/customer-support.error"
import { SupportRequestQuery } from "../../domain/params/customer-support.params"
import { CustomerSupportHttpSource } from "./customer-support-http.source"
import {
  atencionDto,
  atencionView,
  pageOf,
  seguimientoDto,
  seguimientoView,
  supportRequestsUrl,
  supportTypesUrl
} from "./customer-support-http.testing"

function paramsOf(request: {
  request: { params: { keys(): string[]; get(k: string): string | null } }
}) {
  return Object.fromEntries(
    request.request.params.keys().map(key => [key, request.request.params.get(key)])
  )
}

describe("CustomerSupportHttpSource read transport", () => {
  let source: CustomerSupportHttpSource
  let http: HttpTestingController

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        CustomerSupportHttpSource,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: API_URL, useValue: "https://api.example.test" }
      ]
    })
    source = TestBed.inject(CustomerSupportHttpSource)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    try {
      http.verify()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it("GETs the default page with paging only and no blank filters", async () => {
    const pending = firstValueFrom(source.getRequests({}))
    const request = http.expectOne(r => r.url === supportRequestsUrl)
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    expect(paramsOf(request)).toEqual({ pagina: "0", tamanio: "20" })
    request.flush(pageOf([atencionDto()]))
    expect(await pending).toEqual(
      Result.success({ items: [atencionView()], total: 1, offset: 0, limit: 20 })
    )
  })

  it("maps supplied filters to the wire names and omits blank ones", async () => {
    const blank = firstValueFrom(source.getRequests({ state: "   " }))
    const blankRequest = http.expectOne(r => r.url === supportRequestsUrl)
    expect(paramsOf(blankRequest)["estado"]).toBeUndefined()
    blankRequest.flush(pageOf([]))
    expect(await blank).toEqual(Result.success({ items: [], total: 0, offset: 0, limit: 20 }))

    const query: SupportRequestQuery = {
      state: "en_revision",
      requestTypeId: 4,
      customerId: 8,
      fromDate: "2026-03-01",
      toDate: "2026-03-08",
      offset: 40,
      limit: 20
    }
    const pending = firstValueFrom(source.getRequests(query))
    const request = http.expectOne(r => r.url === supportRequestsUrl)
    expect(paramsOf(request)).toEqual({
      pagina: "2",
      tamanio: "20",
      estado: "EN_REVISION",
      idTipo: "4",
      idCliente: "8",
      desde: "2026-03-01",
      hasta: "2026-03-08"
    })
    // Calendar days leave as the literal string the caller typed.
    expect(request.request.params.get("desde")).toBe(query.fromDate)
    expect(request.request.params.get("hasta")).toBe(query.toDate)
    request.flush(pageOf([], { pagina: 2 }))
    expect(await pending).toEqual(Result.success({ items: [], total: 0, offset: 40, limit: 20 }))
  })

  it("keeps the requested offset by adopting the server totals of that page", async () => {
    const pending = firstValueFrom(source.getRequests({ offset: 400, limit: 100 }))
    const request = http.expectOne(r => r.url === supportRequestsUrl)
    expect(paramsOf(request)).toEqual({ pagina: "4", tamanio: "100" })
    request.flush(
      pageOf([atencionDto({ idAtencion: 18 })], {
        pagina: 4,
        tamanio: 100,
        totalElementos: 401,
        totalPaginas: 5
      })
    )
    expect(await pending).toEqual(
      Result.success({ items: [atencionView({ id: 18 })], total: 401, offset: 400, limit: 100 })
    )
  })

  it("refuses a page the server resized, because its rows are not the requested offset", async () => {
    const pending = firstValueFrom(source.getRequests({ offset: 0, limit: 100 }))
    http.expectOne(r => r.url === supportRequestsUrl).flush(
      pageOf([atencionDto(), atencionDto({ idAtencion: 18 })], {
        pagina: 0,
        tamanio: 50,
        totalElementos: 2,
        totalPaginas: 1
      })
    )
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })

  it("refuses a page size above the backend maximum instead of shifting the offset", async () => {
    const pending = firstValueFrom(source.getRequests({ offset: 400, limit: 200 }))
    http.expectNone(() => true)
    expect(await pending).toMatchObject({ success: false, error: { code: "VALIDATION" } })
  })

  it.each([
    ["a foreign page number", { pagina: 1 }],
    ["a zero page size", { tamanio: 0 }],
    ["an inconsistent page count", { totalPaginas: 9 }],
    ["non-array content", { contenido: "nope" }],
    ["a count that contradicts the content", { totalElementos: 5 }],
    ["duplicate record IDs", { contenido: [atencionDto(), atencionDto()], totalElementos: 2 }],
    ["a missing page number", { pagina: undefined }]
  ])("rejects an unknown page shape: %s", async (_label, overrides) => {
    const pending = firstValueFrom(source.getRequests({}))
    http.expectOne(r => r.url === supportRequestsUrl).flush(pageOf([atencionDto()], overrides))
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    if (!result.success) expect(result.error).toBeInstanceOf(CustomerSupportError)
  })

  it("preserves the wire state code with its display name", async () => {
    const pending = firstValueFrom(source.getRequests({}))
    http
      .expectOne(r => r.url === supportRequestsUrl)
      .flush(pageOf([atencionDto({ estado: "EN_REVISION", estadoNombre: "En revisión" })]))
    const result = await pending
    expect(result.success && result.data.items[0]).toMatchObject({
      state: "EN_REVISION",
      stateName: "En revisión"
    })
  })

  it.each(["PENDIENTE", "recibida", "", 3, null])(
    "rejects the unknown state code %s as an invalid response",
    async estado => {
      const pending = firstValueFrom(source.getRequests({}))
      http.expectOne(r => r.url === supportRequestsUrl).flush(pageOf([atencionDto({ estado })]))
      expect(await pending).toMatchObject({
        success: false,
        error: { code: "INVALID_RESPONSE" }
      })
    }
  )

  it("returns the detail with its follow-ups and preserves a redacted null author", async () => {
    const pending = firstValueFrom(source.getRequest(17))
    const request = http.expectOne(`${supportRequestsUrl}/17`)
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.params.keys()).toEqual([])
    request.flush({
      atencion: atencionDto(),
      seguimiento: [
        seguimientoDto(),
        seguimientoDto({
          idSeguimiento: 19,
          autor: "Operadora",
          delCliente: true,
          mensaje: "Réplica del cliente",
          fecha: "2026-03-02T10:00:00Z"
        })
      ]
    })
    const result = await pending
    expect(result).toEqual(
      Result.success({
        request: atencionView(),
        followUps: [
          seguimientoView(),
          seguimientoView({
            id: 19,
            author: "Operadora",
            isFromCustomer: true,
            message: "Réplica del cliente",
            createdAt: new Date("2026-03-02T10:00:00Z")
          })
        ]
      })
    )
    if (result.success) expect(result.data.followUps[0].author).toBeNull()
  })

  it("preserves a supplied order link and closure alongside the null variant", async () => {
    const pending = firstValueFrom(source.getRequest(17))
    http.expectOne(`${supportRequestsUrl}/17`).flush({
      atencion: atencionDto({
        estado: "CERRADA",
        estadoNombre: "Cerrada",
        idOrden: 31,
        codigoOrden: "ORD-31",
        fechaCierre: "2026-03-03T01:02:03-05:00"
      }),
      seguimiento: []
    })
    const closed = await pending
    expect(closed.success && closed.data.request).toMatchObject({
      orderId: 31,
      orderCode: "ORD-31",
      closedAt: new Date("2026-03-03T06:02:03Z")
    })

    const open = firstValueFrom(source.getRequest(17))
    http.expectOne(`${supportRequestsUrl}/17`).flush({ atencion: atencionDto(), seguimiento: [] })
    const openResult = await open
    expect(openResult.success && openResult.data.request).toMatchObject({
      orderId: null,
      orderCode: null,
      closedAt: null
    })
  })

  it("converts OffsetDateTime values to Date without shifting the instant", async () => {
    const pending = firstValueFrom(source.getRequest(17))
    http.expectOne(`${supportRequestsUrl}/17`).flush({
      atencion: atencionDto({
        fechaRegistro: "2026-03-01T23:30:00-05:00",
        fechaCierre: "2026-03-02T00:15:30.5Z"
      }),
      seguimiento: [seguimientoDto()]
    })
    const result = await pending
    expect(
      result.success && [result.data.request.registeredAt, result.data.request.closedAt]
    ).toEqual([new Date("2026-03-02T04:30:00Z"), new Date("2026-03-02T00:15:30.5Z")])
    if (result.success) {
      expect(result.data.request.registeredAt.toISOString()).toBe("2026-03-02T04:30:00.000Z")
      expect(result.data.followUps[0].createdAt.toISOString()).toBe("2026-03-02T16:00:00.000Z")
    }
  })

  it.each([
    ["a local date-time without an offset", "2026-03-01T23:30:00"],
    ["a calendar date only", "2026-03-01"],
    ["an impossible day", "2026-02-30T10:00:00Z"],
    ["a non-string instant", 17]
  ])("rejects %s as a malformed instant", async (_label, fechaRegistro) => {
    const pending = firstValueFrom(source.getRequests({}))
    http
      .expectOne(r => r.url === supportRequestsUrl)
      .flush(pageOf([atencionDto({ fechaRegistro })]))
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })

  it("rejects a detail whose request is another target", async () => {
    const pending = firstValueFrom(source.getRequest(17))
    http
      .expectOne(`${supportRequestsUrl}/17`)
      .flush({ atencion: atencionDto({ idAtencion: 18 }), seguimiento: [] })
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })

  it.each([
    [
      "a malformed request record",
      { atencion: { ...atencionDto(), idCliente: 0 }, seguimiento: [] }
    ],
    ["a missing follow-up list", { atencion: atencionDto() }],
    [
      "a malformed follow-up",
      { atencion: atencionDto(), seguimiento: [{ ...seguimientoDto(), delCliente: "no" }] }
    ],
    [
      "a missing follow-up message",
      { atencion: atencionDto(), seguimiento: [{ ...seguimientoDto(), mensaje: "  " }] }
    ],
    [
      "duplicate follow-up IDs",
      { atencion: atencionDto(), seguimiento: [seguimientoDto(), seguimientoDto()] }
    ]
  ])("rejects %s in the detail payload", async (_label, body) => {
    const pending = firstValueFrom(source.getRequest(17))
    http.expectOne(`${supportRequestsUrl}/17`).flush(body)
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })

  it("returns the type catalog in server order with its documented fields", async () => {
    const pending = firstValueFrom(source.getRequestTypes())
    const request = http.expectOne(supportTypesUrl)
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    request.flush([
      { idTipo: 5, nombre: "Queja", requiereRespuesta: true },
      { idTipo: 4, nombre: "Consulta", requiereRespuesta: false }
    ])
    expect(await pending).toEqual(
      Result.success([
        { id: 5, name: "Queja", requiresResponse: true },
        { id: 4, name: "Consulta", requiresResponse: false }
      ])
    )
  })

  it.each([
    ["a paged wrapper instead of a list", { contenido: [] }],
    ["a non-positive ID", [{ idTipo: 0, nombre: "Queja", requiereRespuesta: true }]],
    ["a missing name", [{ idTipo: 4, nombre: "", requiereRespuesta: true }]],
    ["a missing response flag", [{ idTipo: 4, nombre: "Consulta" }]],
    [
      "duplicate IDs",
      [
        { idTipo: 4, nombre: "Consulta", requiereRespuesta: true },
        { idTipo: 4, nombre: "Queja", requiereRespuesta: false }
      ]
    ]
  ])("rejects %s from the type catalog", async (_label, body) => {
    const pending = firstValueFrom(source.getRequestTypes())
    http.expectOne(supportTypesUrl).flush(body)
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })

  it.each([
    ["an unknown state filter", { state: "PENDIENTE" }],
    ["an impossible calendar day", { fromDate: "2026-02-30" }],
    ["a reversed date range", { fromDate: "2026-03-08", toDate: "2026-03-01" }],
    ["an unaligned offset", { offset: 30, limit: 20 }],
    ["a zero page size", { limit: 0 }],
    ["a non-positive type filter", { requestTypeId: 0 }],
    ["a non-positive customer filter", { customerId: -1 }]
  ])("rejects %s before dispatching any request", async (_label, query) => {
    const result = await firstValueFrom(source.getRequests(query as unknown as SupportRequestQuery))
    expect(result).toMatchObject({ success: false, error: { code: "VALIDATION" } })
    http.expectNone(() => true)
  })

  it.each([
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"]
  ])("maps HTTP %s to a safe %s Result without retry", async (status, code) => {
    const pending = firstValueFrom(source.getRequest(17))
    http
      .expectOne(`${supportRequestsUrl}/17`)
      .flush({ mensaje: "PRIVATE DETAIL" }, { status, statusText: "Error" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    if (!result.success) expect(result.error).toBeInstanceOf(CustomerSupportError)
    http.expectNone(() => true)
  })

  it("maps a server failure to UNAVAILABLE without inventing data", async () => {
    const pending = firstValueFrom(source.getRequests({}))
    http
      .expectOne(r => r.url === supportRequestsUrl)
      .flush({ mensaje: "PRIVATE" }, { status: 500, statusText: "Server Error" })
    expect(await pending).toMatchObject({ success: false, error: { code: "UNAVAILABLE" } })
    http.expectNone(() => true)
  })

  it.each([
    { platform: "server", origin: "https://api.example.test" },
    { platform: "browser", origin: null }
  ])("dispatches nothing for $platform with origin $origin", async ({ platform, origin }) => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        CustomerSupportHttpSource,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: API_URL, useValue: origin }
      ]
    })
    const isolated = TestBed.inject(CustomerSupportHttpSource)
    const isolatedHttp = TestBed.inject(HttpTestingController)
    const operations: Observable<Result<unknown, CustomerSupportError>>[] = [
      isolated.getRequests({}),
      isolated.getRequest(17),
      isolated.getRequestTypes()
    ]
    for (const operation of operations)
      expect(await firstValueFrom(operation)).toMatchObject({
        success: false,
        error: { code: "UNAVAILABLE" }
      })
    isolatedHttp.expectNone(() => true)
  })

  it.each(["list", "detail", "types"] as const)(
    "keeps %s cold and forwards consumer cancellation",
    kind => {
      const operation: Observable<Result<unknown, CustomerSupportError>> =
        kind === "list"
          ? source.getRequests({})
          : kind === "detail"
            ? source.getRequest(17)
            : source.getRequestTypes()
      http.expectNone(() => true)
      const delivered = vi.fn()
      const subscription = operation.subscribe(delivered)
      try {
        const request = http.expectOne(r => r.url.startsWith("https://api.example.test/api/"))
        expect(request.request.method).toBe("GET")
        subscription.unsubscribe()
        expect(request.cancelled).toBe(true)
        expect(delivered).not.toHaveBeenCalled()
        http.expectNone(() => true)
      } finally {
        subscription.unsubscribe()
      }
    }
  )
})
