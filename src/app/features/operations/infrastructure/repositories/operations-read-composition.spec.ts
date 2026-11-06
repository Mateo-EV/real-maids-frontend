import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, Observable, of } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { Result } from "@/app/shared/utils/result"
import {
  GetServiceRequestByIdUseCase,
  ListServiceRequestsUseCase
} from "../../application/use-cases/service-request-read.use-cases"
import {
  CancelServiceRequestUseCase,
  CreateServiceRequestUseCase,
  UpdateServiceRequestUseCase
} from "../../application/use-cases/service-request-write.use-cases"
import { OperationsError } from "../../domain/errors/operations.error"
import { ServiceRequestSummary } from "../../domain/models/operations-read.models"
import {
  OPERATIONS_REPOSITORY,
  OperationsRepository
} from "../../domain/repositories/operations.repository"
import { provideOperationsRequestReads } from "../../operations.providers"
import { ServiceRequestsHttpSource } from "../source/service-requests-http.source"
import { OperationsRepositoryImpl } from "./operations.repository-impl"

const url = "https://api.example.test/api/solicitudes"
const dto = {
  idSolicitud: 17,
  idCliente: 8,
  cliente: "Cliente autorizado",
  idPropiedad: 31,
  propiedad: "Oficina",
  idTipoServicio: 4,
  tipoServicio: "Limpieza",
  descripcion: "  Texto literal  ",
  fechaDeseada: "2026-03-03",
  estado: "registrada",
  registradoPor: "Operadora",
  fechaRegistro: "2026-03-01T23:30:00-05:00",
  fechaActualizacion: null
}
const summary: ServiceRequestSummary = {
  id: 17,
  customerId: 8,
  customerName: "Cliente autorizado",
  propertyId: 31,
  propertyName: "Oficina",
  serviceTypeId: 4,
  serviceTypeName: "Limpieza",
  description: "  Texto literal  ",
  desiredDate: "2026-03-03",
  status: "registrada",
  registeredByName: "Operadora",
  registeredAt: new Date("2026-03-02T04:30:00Z"),
  updatedAt: null
}

describe("Operations request read public composition", () => {
  let http: HttpTestingController
  let repository: OperationsRepository
  let list: ListServiceRequestsUseCase
  let detail: GetServiceRequestByIdUseCase

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: API_URL, useValue: "https://api.example.test" },
        provideOperationsRequestReads()
      ]
    })
    http = TestBed.inject(HttpTestingController)
    repository = TestBed.inject(OPERATIONS_REPOSITORY)
    list = TestBed.inject(ListServiceRequestsUseCase)
    detail = TestBed.inject(GetServiceRequestByIdUseCase)
  })

  afterEach(() => {
    try {
      http.verify()
    } finally {
      vi.restoreAllMocks()
    }
  })

  function read(kind: "list" | "detail"): Observable<Result<unknown, OperationsError>> {
    return kind === "list" ? list.execute({}) : detail.execute(17)
  }

  it("aliases the token to the root implementation, not the root HTTP source", () => {
    expect(repository).toBe(TestBed.inject(OperationsRepositoryImpl))
    expect(repository).not.toBe(TestBed.inject(ServiceRequestsHttpSource))
    expect(TestBed.inject(ListServiceRequestsUseCase)).toBe(list)
    expect(TestBed.inject(GetServiceRequestByIdUseCase)).toBe(detail)
    http.expectNone(() => true)
  })

  it("forwards the complete list query and preserves server scope, order and effective paging", async () => {
    const pending = firstValueFrom(
      list.execute({
        offset: 400,
        limit: 200,
        customerId: 99,
        status: "registrada",
        from: "2026-03-01",
        until: "2026-03-02"
      })
    )
    const req = http.expectOne(r => r.url === url)
    expect(req.request.method).toBe("GET")
    expect(req.request.transferCache).toBe(false)
    expect(
      Object.fromEntries(req.request.params.keys().map(key => [key, req.request.params.get(key)]))
    ).toEqual({
      pagina: "2",
      tamanio: "200",
      idCliente: "99",
      estado: "registrada",
      desde: "2026-03-01",
      hasta: "2026-03-02"
    })
    req.flush({
      contenido: [{ ...dto, idSolicitud: 18 }, dto],
      pagina: 2,
      tamanio: 100,
      totalElementos: 202,
      totalPaginas: 3
    })
    expect(await pending).toEqual(
      Result.success({
        items: [{ ...summary, id: 18 }, summary],
        total: 202,
        offset: 200,
        limit: 100
      })
    )
    http.expectNone(() => true)
  })

  it("forwards the detail ID and returns the source's validated projection", async () => {
    const pending = firstValueFrom(detail.execute(17))
    const req = http.expectOne(`${url}/17`)
    expect(req.request.method).toBe("GET")
    expect(req.request.transferCache).toBe(false)
    expect(req.request.params.keys()).toEqual([])
    req.flush(dto)
    expect(await pending).toEqual(Result.success(summary))
  })

  it("preserves detail identity validation instead of accepting another target", async () => {
    const pending = firstValueFrom(detail.execute(17))
    http.expectOne(`${url}/17`).flush({ ...dto, idSolicitud: 18 })
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })

  it.each(["list", "detail"] as const)(
    "forwards a safe %s HTTP failure Result without retry",
    async kind => {
      const pending = firstValueFrom(read(kind))
      const req = http.expectOne(r => r.url === (kind === "list" ? url : `${url}/17`))
      expect(req.request.method).toBe("GET")
      req.flush({ mensaje: "PRIVATE DETAIL" }, { status: 403, statusText: "Forbidden" })
      const result = await pending
      expect(result).toMatchObject({
        success: false,
        error: { code: "FORBIDDEN", message: "No se pudo consultar la solicitud de servicio." }
      })
      http.expectNone(() => true)
    }
  )

  it.each(["list", "detail"] as const)("keeps %s cold and forwards consumer cancellation", kind => {
    const observable = read(kind)
    http.expectNone(() => true)
    let delivered = false
    const subscription = observable.subscribe(() => {
      delivered = true
    })
    try {
      const req = http.expectOne(r => r.url === (kind === "list" ? url : `${url}/17`))
      expect(req.request.method).toBe("GET")
      subscription.unsubscribe()
      expect(req.cancelled).toBe(true)
      expect(delivered).toBe(false)
    } finally {
      subscription.unsubscribe()
    }
  })

  it("forwards creation through the root repository and stateless action without replacing read composition", async () => {
    const create = TestBed.inject(CreateServiceRequestUseCase)
    expect(TestBed.inject(CreateServiceRequestUseCase)).toBe(create)
    const params = {
      customerId: 8,
      propertyId: 31,
      serviceTypeId: 4,
      description: dto.descripcion,
      desiredDate: dto.fechaDeseada
    }
    const operation = create.execute(params)
    http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = http.expectOne(url)
    expect(request.request.method).toBe("POST")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.body).toEqual({
      idCliente: 8,
      idPropiedad: 31,
      idTipoServicio: 4,
      descripcion: dto.descripcion,
      fechaDeseada: dto.fechaDeseada
    })
    request.flush(dto, { status: 201, statusText: "Created" })
    expect(await pending).toEqual(Result.success(summary))
    expect(TestBed.inject(OPERATIONS_REPOSITORY)).toBe(repository)
    http.expectNone(() => true)
  })

  it("forwards creation failure without retry or a read-shaped error", async () => {
    const pending = firstValueFrom(
      TestBed.inject(CreateServiceRequestUseCase).execute({
        customerId: 8,
        propertyId: 31,
        serviceTypeId: 4,
        description: null,
        desiredDate: null
      })
    )
    http.expectOne(url).flush({ mensaje: "PRIVATE" }, { status: 403, statusText: "Forbidden" })
    expect(await pending).toMatchObject({
      success: false,
      error: { code: "FORBIDDEN", message: "No se pudo crear la solicitud de servicio." }
    })
    http.expectNone(() => true)
  })

  it("forwards creation cancellation without a synthetic success", () => {
    let delivered = false
    const subscription = TestBed.inject(CreateServiceRequestUseCase)
      .execute({
        customerId: 8,
        propertyId: 31,
        serviceTypeId: 4,
        description: null,
        desiredDate: null
      })
      .subscribe(() => (delivered = true))
    const request = http.expectOne(url)
    subscription.unsubscribe()
    expect(request.cancelled).toBe(true)
    expect(delivered).toBe(false)
    http.expectNone(() => true)
  })

  it("forwards update through the stateless action/root repository with exactly four wire fields", async () => {
    const update = TestBed.inject(UpdateServiceRequestUseCase)
    expect(TestBed.inject(UpdateServiceRequestUseCase)).toBe(update)
    const operation = update.execute(17, {
      propertyId: 31,
      serviceTypeId: 4,
      description: dto.descripcion,
      desiredDate: dto.fechaDeseada
    })
    http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = http.expectOne(`${url}/17`)
    expect(request.request.method).toBe("PUT")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.body).toEqual({
      idPropiedad: 31,
      idTipoServicio: 4,
      descripcion: dto.descripcion,
      fechaDeseada: dto.fechaDeseada
    })
    request.flush(dto)
    expect(await pending).toEqual(Result.success(summary))
    expect(TestBed.inject(OPERATIONS_REPOSITORY)).toBe(repository)
    http.expectNone(() => true)
  })

  it("forwards a safe update failure without PUT replay or synthetic success", async () => {
    const pending = firstValueFrom(
      TestBed.inject(UpdateServiceRequestUseCase).execute(17, {
        propertyId: 31,
        serviceTypeId: 4,
        description: null,
        desiredDate: null
      })
    )
    const request = http.expectOne(`${url}/17`)
    expect(request.request.method).toBe("PUT")
    request.flush({ mensaje: "PRIVATE" }, { status: 409, statusText: "Conflict" })
    expect(await pending).toMatchObject({
      success: false,
      error: { code: "CONFLICT", message: "No se pudo actualizar la solicitud de servicio." }
    })
    http.expectNone(() => true)
  })

  it("keeps update cold and forwards caller cancellation through the composition boundary", () => {
    const operation = TestBed.inject(UpdateServiceRequestUseCase).execute(17, {
      propertyId: 31,
      serviceTypeId: 4,
      description: null,
      desiredDate: null
    })
    http.expectNone(() => true)
    let delivered = false
    const subscription = operation.subscribe(() => (delivered = true))
    try {
      const request = http.expectOne(`${url}/17`)
      expect(request.request.method).toBe("PUT")
      subscription.unsubscribe()
      expect(request.cancelled).toBe(true)
      expect(delivered).toBe(false)
      http.expectNone(() => true)
    } finally {
      subscription.unsubscribe()
    }
  })

  it.each(["repository", "usecase"] as const)(
    "forwards cancellation through %s to the existing root source without changing the Result",
    async boundary => {
      const params = { reason: "  Motivo explícito  " }
      const result = Result.success({ ...summary, status: "cancelada" })
      const rootSource = TestBed.inject(ServiceRequestsHttpSource)
      const forward = vi.spyOn(rootSource, "cancelRequest").mockReturnValue(of(result))
      const cancel = TestBed.inject(CancelServiceRequestUseCase)
      expect(TestBed.inject(CancelServiceRequestUseCase)).toBe(cancel)
      const operation =
        boundary === "repository"
          ? repository.cancelRequest(17, params)
          : cancel.execute(17, params)
      expect(await firstValueFrom(operation)).toBe(result)
      expect(forward).toHaveBeenCalledExactlyOnceWith(17, params)
      expect(forward.mock.calls[0]?.[1]).toBe(params)
      expect(TestBed.inject(OPERATIONS_REPOSITORY)).toBe(repository)
      expect(repository).toBe(TestBed.inject(OperationsRepositoryImpl))
      expect(TestBed.inject(ServiceRequestsHttpSource)).toBe(rootSource)
      http.expectNone(() => true)
    }
  )

  it("keeps the cancel action stateless and forwards the token repository's exact failure Result", async () => {
    const result = Result.failure(
      new OperationsError("FORBIDDEN", "No se pudo cancelar la solicitud de servicio.")
    )
    const params = { reason: "Motivo" }
    const forward = vi.spyOn(repository, "cancelRequest").mockReturnValue(of(result))
    const cancel = TestBed.inject(CancelServiceRequestUseCase)
    expect(await firstValueFrom(cancel.execute(17, params))).toBe(result)
    expect(forward).toHaveBeenCalledExactlyOnceWith(17, params)
    expect(forward.mock.calls[0]?.[1]).toBe(params)
    http.expectNone(() => true)
  })

  it.each(["repository", "usecase"] as const)(
    "posts cancellation via %s with only motivo and returns the validated cancelled projection",
    async boundary => {
      const cancel = TestBed.inject(CancelServiceRequestUseCase)
      const params = { reason: "  Motivo explícito  " }
      const operation =
        boundary === "repository"
          ? repository.cancelRequest(17, params)
          : cancel.execute(17, params)
      http.expectNone(() => true)
      const pending = firstValueFrom(operation)
      const request = http.expectOne(`${url}/17/cancelacion`)
      expect(request.request.method).toBe("POST")
      expect(request.request.transferCache).toBe(false)
      expect(request.request.params.keys()).toEqual([])
      expect(request.request.body).toEqual({ motivo: "Motivo explícito" })
      request.flush({ ...dto, estado: "cancelada" })
      expect(await pending).toEqual(Result.success({ ...summary, status: "cancelada" }))
      http.expectNone(() => true)
    }
  )

  it.each(["repository", "usecase"] as const)(
    "preserves safe cancellation failure through %s without a retry or synthetic success",
    async boundary => {
      const params = { reason: "Motivo" }
      const operation =
        boundary === "repository"
          ? repository.cancelRequest(17, params)
          : TestBed.inject(CancelServiceRequestUseCase).execute(17, params)
      const pending = firstValueFrom(operation)
      http
        .expectOne(`${url}/17/cancelacion`)
        .flush({ mensaje: "PRIVATE" }, { status: 409, statusText: "Conflict" })
      expect(await pending).toMatchObject({
        success: false,
        error: { code: "CONFLICT", message: "No se pudo cancelar la solicitud de servicio." }
      })
      http.expectNone(() => true)
    }
  )

  it.each(["repository", "usecase"] as const)(
    "retains target/state response validation through %s",
    async boundary => {
      for (const patch of [{ idSolicitud: 18, estado: "cancelada" }, { estado: "registrada" }]) {
        const params = { reason: "Motivo" }
        const operation =
          boundary === "repository"
            ? repository.cancelRequest(17, params)
            : TestBed.inject(CancelServiceRequestUseCase).execute(17, params)
        const pending = firstValueFrom(operation)
        http.expectOne(`${url}/17/cancelacion`).flush({ ...dto, ...patch })
        expect(await pending).toMatchObject({
          success: false,
          error: {
            code: "INVALID_RESPONSE",
            message: "No se pudo cancelar la solicitud de servicio."
          }
        })
        http.expectNone(() => true)
      }
    }
  )

  it.each(["repository", "usecase"] as const)(
    "keeps %s cancellation cold and caller-owned without an unsubscribe success",
    boundary => {
      const params = { reason: "Motivo" }
      const operation =
        boundary === "repository"
          ? repository.cancelRequest(17, params)
          : TestBed.inject(CancelServiceRequestUseCase).execute(17, params)
      http.expectNone(() => true)
      const delivered = vi.fn()
      const subscription = operation.subscribe(delivered)
      try {
        const request = http.expectOne(`${url}/17/cancelacion`)
        subscription.unsubscribe()
        expect(request.cancelled).toBe(true)
        expect(delivered).not.toHaveBeenCalled()
        http.expectNone(() => true)
      } finally {
        subscription.unsubscribe()
      }
    }
  )

  it("keeps the remaining24 capabilities explicitly UNSUPPORTED with zero HTTP", async () => {
    const quote = { leadId: null, customerId: 8, propertyId: 31, validUntil: null }
    const line = {
      serviceTypeId: 4,
      additionalServiceId: null,
      description: null,
      quantity: 1,
      unitPrice: "10.00"
    }
    const contract = {
      propertyId: 31,
      serviceTypeId: 4,
      frequencyId: 1,
      rateId: 1,
      preferredDay: null,
      preferredTime: null,
      validFrom: "2026-03-03",
      validUntil: null,
      isActive: true
    }
    const status = { name: "Estado", sortOrder: 1, isFinal: false }
    const reason = { name: "Motivo", description: null, isActive: true }
    const operations: Observable<Result<unknown, OperationsError>>[] = [
      repository.createOrder({ requestId: 17, estimatedAmount: null, observation: null }),
      repository.updateOrder(5, { estimatedAmount: null, observation: null }),
      repository.changeOrderStatus(5, { status: "PROGRAMADA", observation: null }),
      repository.scheduleOrder(5, {
        date: "2026-03-03",
        startTime: "09:00",
        endTime: null,
        reasonId: null
      }),
      repository.replaceAssignments(5, { assignments: [] }),
      repository.getAgenda({ from: "2026-03-01", until: "2026-03-02" }),
      repository.getActiveReschedulingReasons(),
      repository.getQuotes({}),
      repository.getQuote(5),
      repository.createQuote({ ...quote, lines: [line] }),
      repository.updateQuote(5, quote),
      repository.getQuoteLines(5),
      repository.createQuoteLine(5, line),
      repository.updateQuoteLine(5, 6, line),
      repository.getContracts({}),
      repository.getContract(5),
      repository.createContract({ ...contract, customerId: 8 }),
      repository.updateContract(5, contract),
      repository.getOrderStatuses(),
      repository.createOrderStatus(status),
      repository.updateOrderStatus(5, status),
      repository.getReschedulingReasons(),
      repository.createReschedulingReason(reason),
      repository.updateReschedulingReason(5, reason)
    ]
    for (const operation of operations) {
      const result = await firstValueFrom(operation)
      expect(result).toMatchObject({
        success: false,
        error: { code: "UNSUPPORTED", message: "Operación no disponible." }
      })
      if (!result.success) expect(result.error).toBeInstanceOf(OperationsError)
      http.expectNone(() => true)
    }
  })
})
