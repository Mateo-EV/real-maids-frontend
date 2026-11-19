import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable, of } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { Result } from "@/app/shared/utils/result"
import {
  AddSupportMessageUseCase,
  ChangeSupportStateUseCase,
  CreateSupportRequestUseCase
} from "../../application/use-cases/customer-support-write.use-cases"
import { CustomerSupportError } from "../../domain/errors/customer-support.error"
import {
  CreateSupportRequestParams,
  AddSupportMessageParams,
  ChangeSupportStateParams
} from "../../domain/params/customer-support.params"
import {
  CUSTOMER_SUPPORT_REPOSITORY,
  CustomerSupportRepository
} from "../../domain/repositories/customer-support.repository"
import { provideCustomerSupportReads } from "../../customer-support.providers"
import { CustomerSupportHttpSource } from "../source/customer-support-http.source"
import {
  atencionDto,
  atencionView,
  seguimientoDto,
  seguimientoView,
  supportRequestsUrl
} from "../source/customer-support-http.testing"
import { CustomerSupportRepositoryImpl } from "./customer-support.repository-impl"

const createInput: CreateSupportRequestParams = {
  customerId: 8,
  orderId: null,
  requestTypeId: 4,
  subject: "Consulta de facturación",
  description: "Texto literal"
}

const bodyOf = (request: { request: { body: unknown } }) =>
  request.request.body as Record<string, unknown>

describe("Customer support public write composition", () => {
  let http: HttpTestingController
  let repository: CustomerSupportRepository
  let create: CreateSupportRequestUseCase
  let addMessage: AddSupportMessageUseCase
  let changeState: ChangeSupportStateUseCase

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: API_URL, useValue: "https://api.example.test" },
        provideCustomerSupportReads()
      ]
    })
    http = TestBed.inject(HttpTestingController)
    repository = TestBed.inject(CUSTOMER_SUPPORT_REPOSITORY)
    create = TestBed.inject(CreateSupportRequestUseCase)
    addMessage = TestBed.inject(AddSupportMessageUseCase)
    changeState = TestBed.inject(ChangeSupportStateUseCase)
  })

  afterEach(() => {
    try {
      http.verify()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it("aliases the domain token to the root implementation for writes too", () => {
    expect(repository).toBe(TestBed.inject(CustomerSupportRepositoryImpl))
    expect(repository).not.toBe(TestBed.inject(CustomerSupportHttpSource))
    expect(TestBed.inject(CreateSupportRequestUseCase)).toBe(create)
    expect(TestBed.inject(AddSupportMessageUseCase)).toBe(addMessage)
    expect(TestBed.inject(ChangeSupportStateUseCase)).toBe(changeState)
    http.expectNone(() => true)
  })

  it("creates through the stateless action and decodes the answer with the read decoder", async () => {
    const operation = create.execute(createInput)
    http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = http.expectOne(r => r.url === supportRequestsUrl)
    expect(request.request.method).toBe("POST")
    expect(bodyOf(request)).toEqual({
      idCliente: 8,
      idTipo: 4,
      asunto: "Consulta de facturación",
      descripcion: "Texto literal"
    })
    request.flush(
      { atencion: atencionDto({ idAtencion: 21 }), seguimiento: [] },
      { status: 201, statusText: "Created" }
    )
    expect(await pending).toEqual(
      Result.success({ request: atencionView({ id: 21 }), followUps: [] })
    )
    http.expectNone(() => true)
  })

  it("registers a follow-up through the stateless action", async () => {
    const pending = firstValueFrom(addMessage.execute(17, { message: "Respuesta" }))
    const request = http.expectOne(`${supportRequestsUrl}/17/seguimiento`)
    expect(request.request.method).toBe("POST")
    expect(bodyOf(request)).toEqual({ mensaje: "Respuesta" })
    request.flush({ atencion: atencionDto(), seguimiento: [seguimientoDto()] })
    expect(await pending).toEqual(
      Result.success({ request: atencionView(), followUps: [seguimientoView()] })
    )
    http.expectNone(() => true)
  })

  it("changes the state through the stateless action", async () => {
    const pending = firstValueFrom(
      changeState.execute(17, { state: "CERRADA", message: "  Se resolvió por teléfono  " })
    )
    const request = http.expectOne(`${supportRequestsUrl}/17/estado`)
    expect(request.request.method).toBe("PATCH")
    expect(bodyOf(request)).toEqual({ estado: "CERRADA", mensaje: "Se resolvió por teléfono" })
    request.flush({
      atencion: atencionDto({ estado: "CERRADA", estadoNombre: "Cerrada" }),
      seguimiento: []
    })
    expect(await pending).toMatchObject({ success: true })
    http.expectNone(() => true)
  })

  it.each([
    [403, "FORBIDDEN"],
    [500, "UNAVAILABLE"]
  ] as ReadonlyArray<[number, string]>)(
    "propagates the %s write failure through the action without fabricated data",
    async (status, code) => {
      const pending = firstValueFrom(changeState.execute(17, { state: "RESUELTA", message: null }))
      http
        .expectOne(`${supportRequestsUrl}/17/estado`)
        .flush({ mensaje: "PRIVATE" }, { status, statusText: "Error" })
      const result = await pending
      expect(result).toMatchObject({ success: false, error: { code } })
      if (!result.success) expect(result.error).toBeInstanceOf(CustomerSupportError)
      http.expectNone(() => true)
    }
  )

  it("keeps every write action a stateless delegate to the token's exact Result", async () => {
    const detail = { request: atencionView(), followUps: [] }
    const success = Result.success(detail)
    const failure = Result.failure(new CustomerSupportError("CONFLICT"))
    const created = vi.spyOn(repository, "createRequest").mockReturnValue(of(success))
    const followed = vi.spyOn(repository, "addMessage").mockReturnValue(of(success))
    const changed = vi.spyOn(repository, "changeState").mockReturnValue(of(failure))
    const message: AddSupportMessageParams = { message: "Respuesta" }
    const state: ChangeSupportStateParams = { state: "RESUELTA", message: null }
    expect(await firstValueFrom(create.execute(createInput))).toBe(success)
    expect(await firstValueFrom(addMessage.execute(17, message))).toBe(success)
    expect(await firstValueFrom(changeState.execute(17, state))).toBe(failure)
    expect(created).toHaveBeenCalledExactlyOnceWith(createInput)
    expect(followed).toHaveBeenCalledExactlyOnceWith(17, message)
    expect(changed).toHaveBeenCalledExactlyOnceWith(17, state)
    http.expectNone(() => true)
  })

  it("keeps the three endpoint-less capabilities UNSUPPORTED with zero HTTP", async () => {
    const operations: Observable<Result<unknown, CustomerSupportError>>[] = [
      repository.getStatuses(),
      repository.getSurveyByOrder(8),
      repository.submitSurvey({ orderId: 8, customerId: 2, rating: 5, comment: null })
    ]
    for (const operation of operations) {
      const result = await firstValueFrom(operation)
      expect(result).toMatchObject({ success: false, error: { code: "UNSUPPORTED" } })
      if (!result.success) expect(result.error).toBeInstanceOf(CustomerSupportError)
      http.expectNone(() => true)
    }
  })

  it.each([
    ["create", () => create.execute(createInput)],
    ["follow-up", () => addMessage.execute(17, { message: "Respuesta" })],
    ["state change", () => changeState.execute(17, { state: "RESUELTA", message: null })]
  ] as const)("keeps %s cold and forwards caller cancellation", (_kind, operation) => {
    const observable = operation()
    http.expectNone(() => true)
    const delivered = vi.fn()
    const subscription = observable.subscribe(delivered)
    try {
      const request = http.expectOne(r => r.url.startsWith("https://api.example.test/api/"))
      subscription.unsubscribe()
      expect(request.cancelled).toBe(true)
      expect(delivered).not.toHaveBeenCalled()
      http.expectNone(() => true)
    } finally {
      subscription.unsubscribe()
    }
  })
})
