import { HttpClient, HttpErrorResponse } from "@angular/common/http"
import { HttpTestingController } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, throwError } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { ReplaceServiceAssignmentsUseCase } from "../../application/use-cases/replace-service-assignments.use-case"
import { OperationsError } from "../../domain/errors/operations.error"
import { AssignmentItemParams } from "../../domain/params/operations.params"
import {
  OperationsRepository,
  OPERATIONS_REPOSITORY
} from "../../domain/repositories/operations.repository"
import { OperationsRepositoryImpl } from "../repositories/operations.repository-impl"
import { ServiceOrdersHttpSource } from "./service-orders-http.source"
import {
  assignedOrderDto,
  assignedOrderSummary,
  assignmentsInput,
  assignmentsUrl,
  setupAssignments
} from "./service-orders-assignments-http.testing"

const raw = "RAW-SENSITIVE"
afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

// T6J [S1/S2/S3/S7]: public repository behavior, not a nonexistent source method.
// RED preparation only: the current repository deliberately completes UNSUPPORTED.
describe("T6J full team replacement through public repository DI/HTTP", () => {
  it("captures only nested primitives at call time and sends one cold exact PUT, not a preflight", async () => {
    const s = setupAssignments()
    const responsible = {
      staffId: 6,
      role: "RESPONSABLE",
      get name(): string {
        throw Error(raw)
      }
    }
    const params = {
      assignments: [responsible, { staffId: 9, role: "APOYO" }],
      get actorId(): number {
        throw Error(raw)
      }
    }
    const operation = s.repository.replaceAssignments(17, params)
    responsible.staffId = 99
    responsible.role = "APOYO"
    params.assignments[1].role = "RESPONSABLE"
    params.assignments.push({ staffId: 11, role: "APOYO" })
    params.assignments = []
    s.http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = s.http.expectOne(assignmentsUrl)
    expect(request.request.method).toBe("PUT")
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.transferCache).toBe(false)
    expect(request.request.body).toEqual({
      asignaciones: [
        { idPersonal: 6, rol: "RESPONSABLE" },
        { idPersonal: 9, rol: "APOYO" }
      ]
    })
    s.http.expectNone(() => true)
    request.flush(assignedOrderDto())
    expect(await pending).toEqual(Result.success(assignedOrderSummary()))
    s.http.expectNone(() => true)
  })

  it("sends explicit [] to remove every assignment and accepts the actual empty flat response", async () => {
    const s = setupAssignments()
    const pending = firstValueFrom(s.repository.replaceAssignments(17, { assignments: [] }))
    const request = s.http.expectOne(assignmentsUrl)
    expect(request.request.method).toBe("PUT")
    expect(request.request.body).toEqual({ asignaciones: [] })
    request.flush({
      ...assignedOrderDto(),
      estado: "PENDIENTE",
      estadoNombre: "Pendiente",
      asignados: []
    })
    expect(await pending).toEqual(
      Result.success({
        ...assignedOrderSummary(),
        status: "PENDIENTE",
        statusName: "Pendiente",
        assignedStaff: []
      })
    )
    s.http.expectNone(() => true)
  })

  it("accepts twenty unique staff, one responsible, including both positive-int32 boundaries", async () => {
    const s = setupAssignments()
    const assignments = Array.from({ length: 20 }, (_, index) => ({
      staffId: index === 19 ? 2147483647 : index + 1,
      role: index === 0 ? "RESPONSABLE" : "APOYO"
    }))
    const pending = firstValueFrom(s.repository.replaceAssignments(2147483647, { assignments }))
    const request = s.http.expectOne("https://api.example.test/api/ordenes/2147483647/asignaciones")
    expect(request.request.method).toBe("PUT")
    expect(request.request.body).toEqual({
      asignaciones: assignments.map(item => ({ idPersonal: item.staffId, rol: item.role }))
    })
    request.flush({
      ...assignedOrderDto(),
      idOrden: 2147483647,
      asignados: assignments.map(item => ({
        idPersonal: item.staffId,
        nombre: `Stored ${item.staffId}`,
        telefono: null,
        rol: item.role.toLowerCase()
      }))
    })
    const result = await pending
    expect(result.success).toBe(true)
    if (!result.success) throw Error("Expected validated replacement")
    expect(result.data.id).toBe(2147483647)
    expect(result.data.assignedStaff).toEqual(
      assignments.map(item => ({
        staffId: item.staffId,
        name: `Stored ${item.staffId}`,
        phone: null,
        role: item.role.toLowerCase()
      }))
    )
    s.http.expectNone(() => true)
  })

  it("keeps read role/status codes open and returns server names, phone null/empty and server order without SQL/detail fields", async () => {
    const s = setupAssignments()
    const pending = firstValueFrom(s.repository.replaceAssignments(17, assignmentsInput()))
    const dto = assignedOrderDto()
    dto.estado = "SERVER_STATE"
    dto.estadoNombre = "Actual state"
    dto.asignados[0].rol = "actual-role-code"
    s.http.expectOne(assignmentsUrl).flush(dto)
    expect(await pending).toEqual(
      Result.success({
        ...assignedOrderSummary(),
        status: "SERVER_STATE",
        statusName: "Actual state",
        assignedStaff: [
          { staffId: 9, name: "  Stored support  ", phone: "", role: "actual-role-code" },
          { staffId: 6, name: "Stored responsible", phone: null, role: "responsable" }
        ]
      })
    )
    s.http.expectNone(() => true)
  })

  it.each([0, -1, 1.5, 2147483648, NaN, Infinity])(
    "rejects invalid order ID %s before HTTP",
    async id => {
      const s = setupAssignments()
      expect(
        await firstValueFrom(s.repository.replaceAssignments(id, assignmentsInput()))
      ).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      s.http.expectNone(() => true)
    }
  )

  const invalidTeams: { label: string; assignments: unknown }[] = [
    {
      label: "twenty-one",
      assignments: Array.from({ length: 21 }, (_, i) => ({
        staffId: i + 1,
        role: i === 0 ? "RESPONSABLE" : "APOYO"
      }))
    },
    {
      label: "duplicate staff",
      assignments: [
        { staffId: 6, role: "RESPONSABLE" },
        { staffId: 6, role: "APOYO" }
      ]
    },
    { label: "no responsible", assignments: [{ staffId: 6, role: "APOYO" }] },
    {
      label: "two responsible",
      assignments: [
        { staffId: 6, role: "RESPONSABLE" },
        { staffId: 9, role: "RESPONSABLE" }
      ]
    },
    ...["responsable", "apoyo", "OTHER", " RESPONSABLE ", ""].map(role => ({
      label: `unsupported role ${role}`,
      assignments: [
        { staffId: 6, role: "RESPONSABLE" },
        { staffId: 9, role }
      ]
    })),
    ...[0, -1, 1.5, 2147483648, NaN, Infinity, "6", null].map(staffId => ({
      label: `bad staff ${staffId}`,
      assignments: [{ staffId, role: "RESPONSABLE" }]
    })),
    {
      label: "null role",
      assignments: [
        { staffId: 6, role: "RESPONSABLE" },
        { staffId: 9, role: null }
      ]
    },
    {
      label: "numeric role",
      assignments: [
        { staffId: 6, role: "RESPONSABLE" },
        { staffId: 9, role: 1 }
      ]
    },
    { label: "missing staff", assignments: [{ role: "RESPONSABLE" }] },
    { label: "null list", assignments: null },
    { label: "missing list", assignments: undefined },
    { label: "scalar list", assignments: 1 },
    { label: "string list", assignments: "[]" },
    { label: "array-like object", assignments: { length: 0 } },
    { label: "null entry", assignments: [null] },
    { label: "scalar entry", assignments: [6] },
    { label: "missing fields", assignments: [{}] },
    { label: "array entry", assignments: [[]] }
  ]
  it.each(invalidTeams)(
    "rejects $label with safe INVALID_DATA and zero HTTP",
    async ({ assignments }) => {
      const s = setupAssignments()
      const params = assignmentsInput()
      // Corrupt a runtime boundary without casting unknown into domain types.
      Object.defineProperty(params, "assignments", { value: assignments })
      const result = await firstValueFrom(s.repository.replaceAssignments(17, params))
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      if (!result.success) expect(result.error.message).not.toContain(raw)
      s.http.expectNone(() => true)
    }
  )

  it("rejects a sparse typed team rather than serializing an array hole as null", async () => {
    const s = setupAssignments()
    const assignments: AssignmentItemParams[] = [{ staffId: 6, role: "RESPONSABLE" }]
    assignments.length = 2
    expect(
      await firstValueFrom(s.repository.replaceAssignments(17, { assignments }))
    ).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    s.http.expectNone(() => true)
  })

  it.each([{ params: null }, { params: 1 }, { params: "invalid" }, { params: [] }, { params: {} }])(
    "rejects malformed top-level input $params without a synchronous throw",
    async ({ params }) => {
      const s = setupAssignments()
      // Reflect supplies deliberately malformed JS arguments to the existing public method;
      // the returned Observable remains explicitly typed (no unsafe domain casts).
      let operation: ReturnType<OperationsRepository["replaceAssignments"]> | undefined
      expect(() => {
        operation = Reflect.apply(s.repository.replaceAssignments, s.repository, [17, params])
      }).not.toThrow()
      if (!operation) throw Error("Missing replacement observable")
      expect(await firstValueFrom(operation)).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
      s.http.expectNone(() => true)
    }
  )

  it.each(["assignments", "entry", "staffId", "role"])(
    "contains throwing requested %s getter with safe INVALID_DATA",
    async key => {
      const s = setupAssignments()
      const params = assignmentsInput()
      const target =
        key === "assignments"
          ? params
          : key === "entry"
            ? params.assignments
            : params.assignments[0]
      Object.defineProperty(target, key === "entry" ? "0" : key, {
        get() {
          throw Error(raw)
        }
      })
      let operation: ReturnType<OperationsRepository["replaceAssignments"]> | undefined
      expect(() => {
        operation = s.repository.replaceAssignments(17, params)
      }).not.toThrow()
      if (!operation) throw Error("Missing replacement observable")
      const result = await firstValueFrom(operation)
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      if (!result.success) expect(result.error.message).not.toContain(raw)
      s.http.expectNone(() => true)
    }
  )

  const malformedResponses: (Record<string, unknown> | null | string)[] = [
    null,
    raw,
    {},
    { ...assignedOrderDto(), idOrden: 18 },
    { ...assignedOrderDto(), idCliente: 0 },
    { ...assignedOrderDto(), asignados: null },
    {
      ...assignedOrderDto(),
      asignados: [{ idPersonal: 0, nombre: "Stored", telefono: null, rol: "apoyo" }]
    },
    {
      ...assignedOrderDto(),
      asignados: [{ idPersonal: 6, nombre: "Stored", telefono: 123, rol: "responsable" }]
    },
    { ...assignedOrderDto(), asignados: [{ idPersonal: 6, nombre: "Stored", telefono: null }] },
    {
      ...assignedOrderDto(),
      asignados: [assignedOrderDto().asignados[0], assignedOrderDto().asignados[0]]
    },
    { orden: assignedOrderDto(), propiedad: {}, historial: [], programaciones: [] }
  ]
  it.each(malformedResponses)("rejects wrong-target/malformed flat response %j", async body => {
    const s = setupAssignments()
    const pending = firstValueFrom(s.repository.replaceAssignments(17, assignmentsInput()))
    s.http.expectOne(assignmentsUrl).flush(body)
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    if (!result.success) expect(result.error.message).not.toContain(raw)
    s.http.expectNone(() => true)
  })

  it.each([
    [0, "UNAVAILABLE"],
    [400, "INVALID_DATA"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [500, "UNAVAILABLE"]
  ] as const)("maps HTTP %s safely with no retry or raw error leakage", async (status, code) => {
    const s = setupAssignments()
    const pending = firstValueFrom(s.repository.replaceAssignments(17, assignmentsInput()))
    const request = s.http.expectOne(assignmentsUrl)
    if (status === 0) request.error(new ProgressEvent("error"))
    else request.flush({ mensaje: raw }, { status, statusText: "Failure" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    if (!result.success) expect(result.error.message).not.toContain(raw)
    s.http.expectNone(() => true)
  })

  it("contains parse-200 failure as INVALID_RESPONSE without a second PUT", async () => {
    const s = setupAssignments()
    const send = vi
      .spyOn(TestBed.inject(HttpClient), "put")
      .mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 200, error: new SyntaxError(raw) }))
      )
    const result = await firstValueFrom(s.repository.replaceAssignments(17, assignmentsInput()))
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    expect(send).toHaveBeenCalledTimes(1)
    if (!result.success) expect(result.error.message).not.toContain(raw)
    s.http.expectNone(() => true)
  })

  it.each(["server", "unconfigured"] as const)("dispatches no %s HTTP or fallback", async mode => {
    const s = setupAssignments(mode === "server", mode === "unconfigured" ? null : undefined)
    expect(
      await firstValueFrom(s.repository.replaceAssignments(17, assignmentsInput()))
    ).toMatchObject({ success: false, error: { code: "UNCONFIGURED" } })
    s.http.expectNone(() => true)
  })

  it("cancels caller observation without a delivered Result, retry or rollback claim", () => {
    const s = setupAssignments()
    const delivered = vi.fn()
    const subscription = s.repository
      .replaceAssignments(17, assignmentsInput())
      .subscribe(delivered)
    try {
      const request = s.http.expectOne(assignmentsUrl)
      subscription.unsubscribe()
      expect(request.cancelled).toBe(true)
      expect(delivered).not.toHaveBeenCalled()
      s.http.expectNone(() => true)
    } finally {
      subscription.unsubscribe()
    }
  })
})

describe("T6J stateless application delegate and unchanged root alias", () => {
  it.each([true, false])(
    "forwards the exact repository Result/Observable, success=%s",
    async success => {
      const s = setupAssignments()
      expect(s.repository).toBe(TestBed.inject(OperationsRepositoryImpl))
      expect(s.repository).not.toBe(TestBed.inject(ServiceOrdersHttpSource))
      const action = TestBed.inject(ReplaceServiceAssignmentsUseCase)
      expect(TestBed.inject(ReplaceServiceAssignmentsUseCase)).toBe(action)
      const result = success
        ? Result.success(assignedOrderSummary())
        : Result.failure(new OperationsError("CONFLICT", "Safe failure"))
      const operation = of(result)
      const delegate = vi.spyOn(s.repository, "replaceAssignments").mockReturnValue(operation)
      const params = assignmentsInput()
      expect(action.execute(17, params)).toBe(operation)
      expect(delegate).toHaveBeenCalledExactlyOnceWith(17, params)
      expect(delegate.mock.calls[0][1]).toBe(params)
      expect(await firstValueFrom(operation)).toBe(result)
      expect(TestBed.inject(OPERATIONS_REPOSITORY)).toBe(s.repository)
      s.http.expectNone(() => true)
    }
  )
})
