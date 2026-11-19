import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { Result } from "@/app/shared/utils/result"
import { CustomerSupportError } from "../../domain/errors/customer-support.error"
import {
  AddSupportMessageParams,
  ChangeSupportStateParams,
  CreateSupportRequestParams
} from "../../domain/params/customer-support.params"
import { CustomerSupportHttpSource } from "./customer-support-http.source"
import {
  atencionDto,
  atencionView,
  seguimientoDto,
  seguimientoView,
  supportRequestsUrl
} from "./customer-support-http.testing"

const createInput = (
  overrides: Partial<CreateSupportRequestParams> = {}
): CreateSupportRequestParams => ({
  customerId: 8,
  orderId: null,
  requestTypeId: 4,
  subject: "Consulta de facturación",
  description: "Texto literal",
  ...overrides
})

const followUpUrl = `${supportRequestsUrl}/17/seguimiento`
const stateUrl = `${supportRequestsUrl}/17/estado`

const repetitive = (length: number) => "a".repeat(length)

type Write = (
  source: CustomerSupportHttpSource
) => Observable<Result<unknown, CustomerSupportError>>

// Each write has its own method and path; the body keys are the documented ones only.
const writes: ReadonlyArray<{ kind: string; method: string; url: string; send: Write }> = [
  {
    kind: "create",
    method: "POST",
    url: supportRequestsUrl,
    send: source => source.createRequest(createInput({ orderId: 31 }))
  },
  {
    kind: "follow-up",
    method: "POST",
    url: followUpUrl,
    send: source => source.addMessage(17, { message: "Respuesta" })
  },
  {
    kind: "state change",
    method: "PATCH",
    url: stateUrl,
    send: source => source.changeState(17, { state: "RESUELTA", message: null })
  }
]

const detailOf = (id: number, extra: Record<string, unknown> = {}) => ({
  atencion: atencionDto({ idAtencion: id, ...extra }),
  seguimiento: []
})

const bodyOf = (request: { request: { body: unknown } }) =>
  request.request.body as Record<string, unknown>

describe("CustomerSupportHttpSource write transport", () => {
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

  it("POSTs a new attention with only the documented keys and trimmed text", async () => {
    const pending = firstValueFrom(
      source.createRequest(
        createInput({
          orderId: 31,
          subject: "  Consulta de facturación  ",
          description: "  Texto  "
        })
      )
    )
    const request = http.expectOne(r => r.url === supportRequestsUrl)
    expect(request.request.method).toBe("POST")
    expect(request.request.transferCache).toBe(false)
    expect(bodyOf(request)).toEqual({
      idCliente: 8,
      idOrden: 31,
      idTipo: 4,
      asunto: "Consulta de facturación",
      descripcion: "Texto"
    })
    expect(Object.keys(bodyOf(request)).sort()).toEqual([
      "asunto",
      "descripcion",
      "idCliente",
      "idOrden",
      "idTipo"
    ])
    // The backend answers 201 with the same detail payload the read detail returns.
    request.flush(
      {
        atencion: atencionDto({ idAtencion: 21, idOrden: 31, codigoOrden: "ORD-31" }),
        seguimiento: []
      },
      { status: 201, statusText: "Created" }
    )
    expect(await pending).toEqual(
      Result.success({
        request: atencionView({ id: 21, orderId: 31, orderCode: "ORD-31" }),
        followUps: []
      })
    )
  })

  it("omits an absent order and keeps a null customer for the own-customer audience", async () => {
    const pending = firstValueFrom(source.createRequest(createInput({ customerId: null })))
    const request = http.expectOne(r => r.url === supportRequestsUrl)
    expect(bodyOf(request)).not.toHaveProperty("idOrden")
    expect(bodyOf(request)["idCliente"]).toBeNull()
    expect(Object.keys(bodyOf(request)).sort()).toEqual([
      "asunto",
      "descripcion",
      "idCliente",
      "idTipo"
    ])
    request.flush(detailOf(21), { status: 201, statusText: "Created" })
    expect(await pending).toMatchObject({ success: true })
  })

  it("POSTs a trimmed follow-up message to the request follow-up path", async () => {
    const params: AddSupportMessageParams = { message: "  Respuesta del personal  " }
    const pending = firstValueFrom(source.addMessage(17, params))
    const request = http.expectOne(followUpUrl)
    expect(request.request.method).toBe("POST")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.params.keys()).toEqual([])
    expect(bodyOf(request)).toEqual({ mensaje: "Respuesta del personal" })
    expect(Object.keys(bodyOf(request))).toEqual(["mensaje"])
    request.flush({ atencion: atencionDto(), seguimiento: [seguimientoDto()] })
    // The existing read decoder owns the write answer too, redacted author included.
    const result = await pending
    expect(result).toEqual(
      Result.success({ request: atencionView(), followUps: [seguimientoView()] })
    )
    if (result.success) expect(result.data.followUps[0].author).toBeNull()
  })

  it("PATCHes the state with a supplied message and omits a blank one", async () => {
    const withMessage = firstValueFrom(
      source.changeState(17, { state: "EN_REVISION", message: "  Revisando la factura  " })
    )
    const first = http.expectOne(stateUrl)
    expect(first.request.method).toBe("PATCH")
    expect(first.request.transferCache).toBe(false)
    expect(bodyOf(first)).toEqual({ estado: "EN_REVISION", mensaje: "Revisando la factura" })
    first.flush(detailOf(17, { estado: "EN_REVISION", estadoNombre: "En revisión" }))
    expect(await withMessage).toMatchObject({ success: true })

    const blank: ChangeSupportStateParams[] = [
      { state: "RESUELTA", message: null },
      { state: "RESUELTA", message: "   " },
      { state: "RESUELTA", message: "" }
    ]
    for (const params of blank) {
      const pending = firstValueFrom(source.changeState(17, params))
      const request = http.expectOne(stateUrl)
      expect(bodyOf(request)).toEqual({ estado: "RESUELTA" })
      expect(bodyOf(request)).not.toHaveProperty("mensaje")
      request.flush(detailOf(17, { estado: "RESUELTA", estadoNombre: "Resuelta" }))
      expect(await pending).toMatchObject({ success: true })
    }
  })

  it("sends every documented target code the caller asked for, leaving transitions to the server", async () => {
    for (const state of ["EN_REVISION", "RESUELTA", "CERRADA"]) {
      const pending = firstValueFrom(source.changeState(17, { state, message: null }))
      const request = http.expectOne(stateUrl)
      expect(bodyOf(request)).toEqual({ estado: state })
      request.flush(detailOf(17, { estado: state }))
      expect(await pending).toMatchObject({ success: true })
    }
  })

  it("surfaces the server's rejection of a state it does not accept", async () => {
    const pending = firstValueFrom(source.changeState(17, { state: "PENDIENTE", message: null }))
    http
      .expectOne(stateUrl)
      .flush({ mensaje: "Transición no permitida" }, { status: 400, statusText: "Bad Request" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "VALIDATION" } })
    if (!result.success) expect(result.error.message).not.toContain("Transición")
    http.expectNone(() => true)
  })

  it.each([
    ["a blank subject", { subject: "   " }],
    ["a subject over 150 characters", { subject: repetitive(151) }],
    ["a blank description", { description: "  " }],
    ["a description over 4000 characters", { description: repetitive(4001) }],
    ["a missing subject", { subject: undefined }],
    ["a non-positive request type", { requestTypeId: 0 }],
    ["a fractional request type", { requestTypeId: 4.5 }],
    ["a supplied non-positive order", { orderId: 0 }],
    ["a supplied non-positive customer", { customerId: -1 }],
    ["a missing customer", { customerId: undefined }]
  ] as ReadonlyArray<[string, Partial<CreateSupportRequestParams>]>)(
    "rejects %s as VALIDATION without dispatching",
    async (_label, override) => {
      const result = await firstValueFrom(
        source.createRequest(createInput(override as Partial<CreateSupportRequestParams>))
      )
      expect(result).toMatchObject({ success: false, error: { code: "VALIDATION" } })
      http.expectNone(() => true)
    }
  )

  it.each([
    ["a blank message", { message: "   " }],
    ["a message over 4000 characters", { message: repetitive(4001) }],
    ["a non-string message", { message: 17 }]
  ] as ReadonlyArray<[string, unknown]>)(
    "rejects %s in a follow-up without dispatching",
    async (_label, params) => {
      const result = await firstValueFrom(source.addMessage(17, params as AddSupportMessageParams))
      expect(result).toMatchObject({ success: false, error: { code: "VALIDATION" } })
      http.expectNone(() => true)
    }
  )

  it.each([
    ["a blank state", ""],
    ["a whitespace state", "   "],
    ["a missing state", undefined],
    ["a non-string state", 7]
  ])("rejects %s as VALIDATION without dispatching", async (_label, state) => {
    const result = await firstValueFrom(
      source.changeState(17, { state, message: null } as ChangeSupportStateParams)
    )
    expect(result).toMatchObject({ success: false, error: { code: "VALIDATION" } })
    http.expectNone(() => true)
  })

  it("rejects a change-state message over 4000 characters without dispatching", async () => {
    const result = await firstValueFrom(
      source.changeState(17, { state: "RESUELTA", message: repetitive(4001) })
    )
    expect(result).toMatchObject({ success: false, error: { code: "VALIDATION" } })
    http.expectNone(() => true)
  })

  it("preserves inner whitespace and line breaks while trimming only the edges", async () => {
    const pending = firstValueFrom(source.addMessage(17, { message: "  Línea uno\n  Línea dos  " }))
    const request = http.expectOne(followUpUrl)
    expect(bodyOf(request)["mensaje"]).toBe("Línea uno\n  Línea dos")
    request.flush(detailOf(17))
    expect(await pending).toMatchObject({ success: true })
  })

  it("rejects a non-string change-state message without dispatching", async () => {
    const result = await firstValueFrom(
      source.changeState(17, {
        state: "RESUELTA",
        message: 4000
      } as unknown as ChangeSupportStateParams)
    )
    expect(result).toMatchObject({ success: false, error: { code: "VALIDATION" } })
    http.expectNone(() => true)
  })

  it("turns a hostile params object into VALIDATION instead of a synchronous throw", async () => {
    const hostile = {
      customerId: 8,
      orderId: null,
      requestTypeId: 4,
      description: "Texto literal",
      get subject(): string {
        throw new Error("hostile getter")
      }
    }
    const operation = source.createRequest(hostile as CreateSupportRequestParams)
    const result = await firstValueFrom(operation)
    expect(result).toMatchObject({ success: false, error: { code: "VALIDATION" } })
    http.expectNone(() => true)
  })

  it("accepts the documented text limits exactly, without truncating the caller's bytes", async () => {
    const pending = firstValueFrom(
      source.createRequest(createInput({ subject: repetitive(150), description: repetitive(4000) }))
    )
    const request = http.expectOne(r => r.url === supportRequestsUrl)
    expect(bodyOf(request)["asunto"]).toHaveLength(150)
    expect(bodyOf(request)["descripcion"]).toHaveLength(4000)
    request.flush(detailOf(21), { status: 201, statusText: "Created" })
    expect(await pending).toMatchObject({ success: true })
  })

  it.each([
    ["follow-up", 0],
    ["follow-up", -3],
    ["follow-up", 2.5],
    ["follow-up", 2147483648],
    ["follow-up", Number.NaN],
    ["state change", 0],
    ["state change", -3],
    ["state change", 2.5],
    ["state change", 2147483648],
    ["state change", Number.NaN]
  ] as ReadonlyArray<["follow-up" | "state change", number]>)(
    "dispatches no %s for the invalid target id %s",
    async (kind, id) => {
      const operation =
        kind === "follow-up"
          ? source.addMessage(id, { message: "Respuesta" })
          : source.changeState(id, { state: "RESUELTA", message: null })
      const result = await firstValueFrom(operation)
      expect(result).toMatchObject({ success: false, error: { code: "VALIDATION" } })
      http.expectNone(() => true)
    }
  )

  it.each(writes)(
    "rejects a malformed $kind answer as INVALID_RESPONSE instead of a success",
    async ({ kind, url, send }) => {
      const pending = firstValueFrom(send(source))
      http.expectOne(r => r.url === url).flush({ atencion: "nope" })
      const result = await pending
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
      if (!result.success) expect(result.error).toBeInstanceOf(CustomerSupportError)
      expect(kind).toBeTruthy()
    }
  )

  it.each(["follow-up", "state change"] as const)(
    "rejects a %s answer that describes another request",
    async kind => {
      const operation =
        kind === "follow-up"
          ? source.addMessage(17, { message: "Respuesta" })
          : source.changeState(17, { state: "RESUELTA", message: null })
      const pending = firstValueFrom(operation)
      http
        .expectOne(r => r.url === (kind === "follow-up" ? followUpUrl : stateUrl))
        .flush(detailOf(18))
      expect(await pending).toMatchObject({
        success: false,
        error: { code: "INVALID_RESPONSE" }
      })
    }
  )

  it.each([
    ["another type", { idTipo: 5 }],
    ["another customer", { idCliente: 9 }],
    ["another order", { idOrden: 77, codigoOrden: "ORD-77" }]
  ])("rejects a create answer that registered %s", async (_label, override) => {
    const pending = firstValueFrom(source.createRequest(createInput({ orderId: 31 })))
    http
      .expectOne(r => r.url === supportRequestsUrl)
      .flush(detailOf(21, { idOrden: 31, codigoOrden: "ORD-31", ...override }), {
        status: 201,
        statusText: "Created"
      })
    expect(await pending).toMatchObject({
      success: false,
      error: { code: "INVALID_RESPONSE" }
    })
  })

  it.each([
    [400, "VALIDATION"],
    [403, "FORBIDDEN"],
    [409, "CONFLICT"],
    [500, "UNAVAILABLE"]
  ] as ReadonlyArray<[number, string]>)(
    "maps HTTP %s to %s for every write without retrying",
    async (status, code) => {
      for (const { url, send } of writes) {
        const pending = firstValueFrom(send(source))
        http
          .expectOne(r => r.url === url)
          .flush({ mensaje: "PRIVATE BACKEND TEXT" }, { status, statusText: "Error" })
        const result = await pending
        expect(result).toMatchObject({ success: false, error: { code } })
        if (!result.success) {
          expect(result.error).toBeInstanceOf(CustomerSupportError)
          expect(result.error.message).not.toContain("PRIVATE")
        }
        http.expectNone(() => true)
      }
    }
  )

  it.each([
    { platform: "server", origin: "https://api.example.test" },
    { platform: "browser", origin: null }
  ])("dispatches no write for $platform with origin $origin", async ({ platform, origin }) => {
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
    for (const { send } of writes) {
      const result = await firstValueFrom(send(isolated))
      expect(result).toMatchObject({ success: false, error: { code: "UNAVAILABLE" } })
    }
    isolatedHttp.expectNone(() => true)
  })

  it.each(writes)("keeps $kind cold and forwards caller cancellation", ({ url, send }) => {
    const operation = send(source)
    http.expectNone(() => true)
    const delivered = vi.fn()
    const subscription = operation.subscribe(delivered)
    try {
      const request = http.expectOne(r => r.url === url)
      subscription.unsubscribe()
      expect(request.cancelled).toBe(true)
      expect(delivered).not.toHaveBeenCalled()
      http.expectNone(() => true)
    } finally {
      subscription.unsubscribe()
    }
  })
})
