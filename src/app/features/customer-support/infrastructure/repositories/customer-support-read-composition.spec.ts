import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable, of } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { Result } from "@/app/shared/utils/result"
import {
  GetSupportRequestByIdUseCase,
  GetSupportRequestTypesUseCase,
  ListSupportRequestsUseCase
} from "../../application/use-cases/customer-support-read.use-cases"
import { CustomerSupportError } from "../../domain/errors/customer-support.error"
import {
  CUSTOMER_SUPPORT_REPOSITORY,
  CustomerSupportRepository
} from "../../domain/repositories/customer-support.repository"
import { provideCustomerSupportReads } from "../../customer-support.providers"
import { CustomerSupportHttpSource } from "../source/customer-support-http.source"
import {
  atencionDto,
  atencionView,
  pageOf,
  seguimientoDto,
  seguimientoView,
  supportRequestsUrl,
  supportTypesUrl
} from "../source/customer-support-http.testing"
import { CustomerSupportRepositoryImpl } from "./customer-support.repository-impl"

describe("Customer support public read composition", () => {
  let http: HttpTestingController
  let repository: CustomerSupportRepository
  let list: ListSupportRequestsUseCase
  let detail: GetSupportRequestByIdUseCase
  let types: GetSupportRequestTypesUseCase

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
    list = TestBed.inject(ListSupportRequestsUseCase)
    detail = TestBed.inject(GetSupportRequestByIdUseCase)
    types = TestBed.inject(GetSupportRequestTypesUseCase)
  })

  afterEach(() => {
    try {
      http.verify()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it("aliases the domain token to the root implementation, not the root HTTP source", () => {
    expect(repository).toBe(TestBed.inject(CustomerSupportRepositoryImpl))
    expect(repository).not.toBe(TestBed.inject(CustomerSupportHttpSource))
    expect("getRequests" in TestBed.inject(CustomerSupportHttpSource)).toBe(true)
    expect(TestBed.inject(ListSupportRequestsUseCase)).toBe(list)
    expect(TestBed.inject(GetSupportRequestByIdUseCase)).toBe(detail)
    expect(TestBed.inject(GetSupportRequestTypesUseCase)).toBe(types)
    http.expectNone(() => true)
  })

  it("reads the inbox through the stateless action with filters and effective paging", async () => {
    const operation = list.execute({
      offset: 40,
      limit: 20,
      state: "EN_REVISION",
      requestTypeId: 4,
      customerId: 8,
      fromDate: "2026-03-01",
      toDate: "2026-03-08"
    })
    http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = http.expectOne(r => r.url === supportRequestsUrl)
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    expect(
      Object.fromEntries(
        request.request.params.keys().map(key => [key, request.request.params.get(key)])
      )
    ).toEqual({
      pagina: "2",
      tamanio: "20",
      estado: "EN_REVISION",
      idTipo: "4",
      idCliente: "8",
      desde: "2026-03-01",
      hasta: "2026-03-08"
    })
    request.flush(pageOf([atencionDto()], { pagina: 2, totalElementos: 41, totalPaginas: 3 }))
    expect(await pending).toEqual(
      Result.success({ items: [atencionView()], total: 41, offset: 40, limit: 20 })
    )
    http.expectNone(() => true)
  })

  it("reads the detail through the stateless action with the redacted author intact", async () => {
    const pending = firstValueFrom(detail.execute(17))
    http.expectOne(`${supportRequestsUrl}/17`).flush({
      atencion: atencionDto({ idOrden: 31, codigoOrden: "ORD-31" }),
      seguimiento: [seguimientoDto()]
    })
    const result = await pending
    expect(result).toEqual(
      Result.success({
        request: atencionView({ orderId: 31, orderCode: "ORD-31" }),
        followUps: [seguimientoView()]
      })
    )
    if (result.success) expect(result.data.followUps[0].author).toBeNull()
  })

  it("reads the type catalog through the stateless action in server order", async () => {
    const pending = firstValueFrom(types.execute())
    http.expectOne(supportTypesUrl).flush([
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
    ["list", () => list.execute({}), supportRequestsUrl],
    ["detail", () => detail.execute(17), `${supportRequestsUrl}/17`],
    ["types", () => types.execute(), supportTypesUrl]
  ] as const)(
    "propagates the %s repository failure without retry or fabricated data",
    async (_kind, operation, url) => {
      const pending = firstValueFrom(
        operation() as Observable<Result<unknown, CustomerSupportError>>
      )
      http
        .expectOne(r => r.url === url)
        .flush({ mensaje: "PRIVATE DETAIL" }, { status: 403, statusText: "Forbidden" })
      const result = await pending
      expect(result).toMatchObject({ success: false, error: { code: "FORBIDDEN" } })
      if (!result.success) expect(result.error).toBeInstanceOf(CustomerSupportError)
      http.expectNone(() => true)
    }
  )

  it("keeps every action a stateless delegate to the token's exact Result", async () => {
    const failure = Result.failure(new CustomerSupportError("FORBIDDEN"))
    const success = Result.success([{ id: 4, name: "Consulta", requiresResponse: false }])
    const requestTypes = vi.spyOn(repository, "getRequestTypes").mockReturnValue(of(success))
    const page = vi
      .spyOn(repository, "getRequestsPage")
      .mockReturnValue(
        of(Result.success({ items: [atencionView()], total: 1, offset: 0, limit: 20 }))
      )
    const byId = vi
      .spyOn(repository, "getRequest")
      .mockReturnValue(of(Result.success({ request: atencionView(), followUps: [] })))
    expect(await firstValueFrom(types.execute())).toBe(success)
    expect(await firstValueFrom(list.execute({}))).toMatchObject({ success: true })
    expect(await firstValueFrom(detail.execute(17))).toMatchObject({ success: true })
    expect(requestTypes).toHaveBeenCalledExactlyOnceWith()
    expect(page).toHaveBeenCalledExactlyOnceWith({})
    expect(byId).toHaveBeenCalledExactlyOnceWith(17)
    requestTypes.mockReturnValue(of(failure))
    expect(await firstValueFrom(types.execute())).toBe(failure)
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
    ["list", () => list.execute({})],
    ["detail", () => detail.execute(17)],
    ["types", () => types.execute()]
  ] as const)("keeps %s cold and forwards caller cancellation", (_kind, operation) => {
    const observable = operation() as Observable<Result<unknown, CustomerSupportError>>
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

  it.each([
    { platform: "server", origin: "https://api.example.test" },
    { platform: "browser", origin: null }
  ])("dispatches no read for $platform with origin $origin", async ({ platform, origin }) => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: API_URL, useValue: origin },
        provideCustomerSupportReads()
      ]
    })
    const isolatedHttp = TestBed.inject(HttpTestingController)
    const isolatedRepository = TestBed.inject(CUSTOMER_SUPPORT_REPOSITORY)
    const isolatedList = TestBed.inject(ListSupportRequestsUseCase)
    const operations: Observable<Result<unknown, CustomerSupportError>>[] = [
      isolatedRepository.getRequestsPage({}),
      isolatedRepository.getRequest(17),
      isolatedRepository.getRequestTypes(),
      isolatedList.execute({})
    ]
    for (const operation of operations)
      expect(await firstValueFrom(operation)).toMatchObject({
        success: false,
        error: { code: "UNAVAILABLE" }
      })
    isolatedHttp.expectNone(() => true)
  })
})
