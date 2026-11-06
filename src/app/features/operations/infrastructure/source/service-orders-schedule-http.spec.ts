import { HttpClient, HttpErrorResponse } from "@angular/common/http"
import { HttpTestingController } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, throwError } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { ScheduleServiceOrderParams } from "../../domain/params/operations.params"
import { ServiceOrdersHttpSource } from "./service-orders-http.source"
import {
  scheduleInput,
  scheduledOrderDto,
  scheduledOrderSummary,
  scheduleUrl,
  setupScheduling
} from "./service-orders-schedule-http.testing"

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

describe("T6H cold scheduling source public DI/HTTP", () => {
  it("captures only four fields at call time and sends a cold first-schedule PUT with explicit nulls", async () => {
    const s = setupScheduling()
    const params = {
      ...scheduleInput(),
      get status(): string {
        throw Error("UNREAD EXTRA FIELD")
      }
    }
    const operation = s.source.scheduleOrder(17, params)
    params.date = "2030-01-01"
    params.startTime = "12:00"
    params.endTime = "13:00"
    params.reasonId = 99
    s.http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = s.http.expectOne(scheduleUrl)
    expect(request.request.method).toBe("PUT")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.body).toEqual({
      fecha: "2024-02-29",
      horaInicio: "08:15:49.123456789",
      horaFin: null,
      idMotivo: null
    })
    s.http.expectNone(() => true)
    request.flush(scheduledOrderDto())
    expect(await pending).toEqual(Result.success(scheduledOrderSummary()))
    s.http.expectNone(() => true)
  })

  it("sends a reason-bearing reschedule without preflight and trusts actual stored values, not an input echo", async () => {
    const s = setupScheduling()
    const pending = firstValueFrom(
      s.source.scheduleOrder(17, {
        date: "2024-03-01",
        startTime: "10:20:30.1",
        endTime: "11:50:59.999999999",
        reasonId: 7
      })
    )
    const request = s.http.expectOne(scheduleUrl)
    expect(request.request.method).toBe("PUT")
    expect(request.request.body).toEqual({
      fecha: "2024-03-01",
      horaInicio: "10:20:30.1",
      horaFin: "11:50:59.999999999",
      idMotivo: 7
    })
    const dto = scheduledOrderDto()
    dto.estado = "PROGRAMADA"
    dto.estadoNombre = "Programada"
    dto.programacion = {
      ...dto.programacion,
      fecha: "2024-03-01",
      horaInicio: "10:20:00",
      horaFin: "11:50:00"
    }
    request.flush(dto)
    expect(await pending).toEqual(
      Result.success({
        ...scheduledOrderSummary(),
        status: "PROGRAMADA",
        statusName: "Programada",
        schedule: {
          ...scheduledOrderSummary().schedule,
          id: 51,
          date: "2024-03-01",
          startTime: "10:20:00",
          endTime: "11:50:00"
        }
      })
    )
    s.http.expectNone(() => true)
  })

  it.each(["00:00", "23:59:59.123456789"])(
    "preserves literal past calendar and clock %s without business-clock or end-order inference",
    async startTime => {
      const s = setupScheduling()
      const pending = firstValueFrom(
        s.source.scheduleOrder(17, {
          date: "2000-02-29",
          startTime,
          endTime: "00:00",
          reasonId: 2147483647
        })
      )
      const request = s.http.expectOne(scheduleUrl)
      expect(request.request.body).toEqual({
        fecha: "2000-02-29",
        horaInicio: startTime,
        horaFin: "00:00",
        idMotivo: 2147483647
      })
      request.flush({}, { status: 400, statusText: "Business validation" })
      expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      s.http.expectNone(() => true)
    }
  )

  it.each([0, -1, 1.5, 2147483648, NaN, Infinity])(
    "rejects invalid order int32 %s safely before HTTP",
    async id => {
      const s = setupScheduling()
      expect(await firstValueFrom(s.source.scheduleOrder(id, scheduleInput()))).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
      s.http.expectNone(() => true)
    }
  )

  const invalidInputs: Partial<ScheduleServiceOrderParams>[] = [
    { date: "" },
    { date: "2025-02-29" },
    { date: "2024-13-01" },
    { date: "2024-02-29T00:00:00Z" },
    { startTime: "" },
    { startTime: "24:00" },
    { startTime: "09:60" },
    { startTime: "10:00:60" },
    { startTime: "10:00:00.1234567890" },
    { startTime: "10:00Z" },
    { endTime: "" },
    { endTime: "25:00" },
    { reasonId: 0 },
    { reasonId: -1 },
    { reasonId: 1.5 },
    { reasonId: 2147483648 },
    { reasonId: NaN }
  ]
  it.each(invalidInputs)(
    "returns safe INVALID_DATA for malformed schedule %j without dispatch",
    async patch => {
      const s = setupScheduling()
      expect(
        await firstValueFrom(s.source.scheduleOrder(17, { ...scheduleInput(), ...patch }))
      ).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
      s.http.expectNone(() => true)
    }
  )

  it.each(["date", "startTime", "endTime", "reasonId"])(
    "captures throwing %s getters without a synchronous exception or HTTP",
    async key => {
      const s = setupScheduling(),
        params = scheduleInput()
      Object.defineProperty(params, key, {
        get() {
          throw Error("RAW-SENSITIVE")
        }
      })
      let operation: ReturnType<ServiceOrdersHttpSource["scheduleOrder"]> | undefined
      expect(() => {
        operation = s.source.scheduleOrder(17, params)
      }).not.toThrow()
      expect(operation).toBeDefined()
      if (!operation) throw Error("Missing schedule observable")
      const result = await firstValueFrom(operation)
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
      if (!result.success) expect(result.error.message).not.toContain("RAW-SENSITIVE")
      s.http.expectNone(() => true)
    }
  )

  const malformedResponses: (Record<string, unknown> | null | string)[] = [
    null,
    "RAW-SENSITIVE",
    {},
    { ...scheduledOrderDto(), idOrden: 18 },
    { ...scheduledOrderDto(), idCliente: 0 },
    { ...scheduledOrderDto(), codigo: "" },
    { ...scheduledOrderDto(), montoEstimado: 1.001 },
    {
      ...scheduledOrderDto(),
      programacion: { ...scheduledOrderDto().programacion, fecha: "2025-02-29" }
    },
    {
      ...scheduledOrderDto(),
      programacion: { ...scheduledOrderDto().programacion, horaInicio: "24:00" }
    },
    { orden: scheduledOrderDto(), propiedad: {}, historial: [], programaciones: [] }
  ]
  it.each(malformedResponses)(
    "rejects wrong-target or malformed flat response %j as INVALID_RESPONSE",
    async body => {
      const s = setupScheduling(),
        pending = firstValueFrom(s.source.scheduleOrder(17, scheduleInput()))
      s.http.expectOne(scheduleUrl).flush(body)
      const result = await pending
      expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
      if (!result.success) expect(result.error.message).not.toContain("RAW-SENSITIVE")
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
  ] as const)("maps scheduling HTTP %s safely without retry", async (status, code) => {
    const s = setupScheduling(),
      pending = firstValueFrom(s.source.scheduleOrder(17, scheduleInput()))
    const request = s.http.expectOne(scheduleUrl)
    if (status === 0) request.error(new ProgressEvent("error"))
    else request.flush({ mensaje: "RAW-SENSITIVE" }, { status, statusText: "Failure" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    if (!result.success) expect(result.error.message).not.toContain("RAW-SENSITIVE")
    s.http.expectNone(() => true)
  })

  it("maps parse-200 failure to safe INVALID_RESPONSE without PUT retry", async () => {
    const s = setupScheduling()
    const send = vi
      .spyOn(TestBed.inject(HttpClient), "put")
      .mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 200, error: new SyntaxError("RAW-SENSITIVE") })
        )
      )
    const result = await firstValueFrom(s.source.scheduleOrder(17, scheduleInput()))
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    expect(send).toHaveBeenCalledTimes(1)
    if (!result.success) expect(result.error.message).not.toContain("RAW-SENSITIVE")
    s.http.expectNone(() => true)
  })

  it("keeps cancellation caller-owned with no synthetic completion or replay", () => {
    const s = setupScheduling(),
      delivered = vi.fn()
    const subscription = s.source.scheduleOrder(17, scheduleInput()).subscribe(delivered)
    try {
      const request = s.http.expectOne(scheduleUrl)
      subscription.unsubscribe()
      expect(request.cancelled).toBe(true)
      expect(delivered).not.toHaveBeenCalled()
      s.http.expectNone(() => true)
    } finally {
      subscription.unsubscribe()
    }
  })

  it.each(["server", "unconfigured"] as const)(
    "dispatches no %s scheduling request or fallback",
    async mode => {
      const s = setupScheduling(mode === "server", mode === "unconfigured" ? null : undefined)
      expect(await firstValueFrom(s.source.scheduleOrder(17, scheduleInput()))).toMatchObject({
        success: false,
        error: { code: "UNCONFIGURED" }
      })
      s.http.expectNone(() => true)
    }
  )
})
