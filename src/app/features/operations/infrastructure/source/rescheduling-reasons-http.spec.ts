import { HttpClient, HttpErrorResponse } from "@angular/common/http"
import { HttpTestingController } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, throwError } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { reasonsUrl, setupScheduling } from "./service-orders-schedule-http.testing"

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

describe("T6H active rescheduling reasons public DI/HTTP", () => {
  it("makes a cold exact GET and preserves server order and literal nullable text without invented active fields", async () => {
    const s = setupScheduling(),
      operation = s.source.getActiveReschedulingReasons()
    s.http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = s.http.expectOne(reasonsUrl)
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.body).toBeNull()
    request.flush([
      { idMotivo: 9, nombre: "  A literal  ", descripcion: null },
      { idMotivo: 2, nombre: "B", descripcion: "" },
      { idMotivo: 2147483647, nombre: "C", descripcion: "  <b>Literal</b>  " }
    ])
    expect(await pending).toEqual(
      Result.success([
        { id: 9, name: "  A literal  ", description: null },
        { id: 2, name: "B", description: "" },
        { id: 2147483647, name: "C", description: "  <b>Literal</b>  " }
      ])
    )
    s.http.expectNone(() => true)
  })

  it("accepts a verified empty active catalog without inferring permissions or defaults", async () => {
    const s = setupScheduling(),
      pending = firstValueFrom(s.source.getActiveReschedulingReasons())
    s.http.expectOne(reasonsUrl).flush([])
    expect(await pending).toEqual(Result.success([]))
    s.http.expectNone(() => true)
  })

  const malformed: { name: string; body: object | string | number | null }[] = [
    { name: "null", body: null },
    { name: "not-array", body: {} },
    { name: "scalar", body: "RAW-SENSITIVE" },
    { name: "null-item", body: [null] },
    { name: "missing-fields", body: [{}] },
    ...[0, -1, 1.5, 2147483648, "7"].map(idMotivo => ({
      name: `invalid-id-${idMotivo}`,
      body: [{ idMotivo, nombre: "A", descripcion: null }]
    })),
    ...[null, "", "   ", 7].map(nombre => ({
      name: `invalid-name-${nombre}`,
      body: [{ idMotivo: 7, nombre, descripcion: null }]
    })),
    { name: "missing-description", body: [{ idMotivo: 7, nombre: "A" }] },
    { name: "invalid-description", body: [{ idMotivo: 7, nombre: "A", descripcion: 7 }] },
    {
      name: "duplicate-id",
      body: [
        { idMotivo: 7, nombre: "A", descripcion: null },
        { idMotivo: 7, nombre: "B", descripcion: "" }
      ]
    }
  ]
  it.each(malformed)("rejects unknown catalog $name as safe INVALID_RESPONSE", async ({ body }) => {
    const s = setupScheduling(),
      pending = firstValueFrom(s.source.getActiveReschedulingReasons())
    s.http.expectOne(reasonsUrl).flush(body)
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    if (!result.success) expect(result.error.message).not.toContain("RAW-SENSITIVE")
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
  ] as const)("maps reasons HTTP %s safely without retry or fallback", async (status, code) => {
    const s = setupScheduling(),
      pending = firstValueFrom(s.source.getActiveReschedulingReasons())
    const request = s.http.expectOne(reasonsUrl)
    if (status === 0) request.error(new ProgressEvent("error"))
    else request.flush({ mensaje: "RAW-SENSITIVE" }, { status, statusText: "Failure" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    if (!result.success) expect(result.error.message).not.toContain("RAW-SENSITIVE")
    s.http.expectNone(() => true)
  })

  it("keeps parse-200 failure INVALID_RESPONSE with no catalog retry", async () => {
    const s = setupScheduling()
    const send = vi
      .spyOn(TestBed.inject(HttpClient), "get")
      .mockReturnValue(
        throwError(
          () => new HttpErrorResponse({ status: 200, error: new SyntaxError("RAW-SENSITIVE") })
        )
      )
    const result = await firstValueFrom(s.source.getActiveReschedulingReasons())
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    expect(send).toHaveBeenCalledTimes(1)
    if (!result.success) expect(result.error.message).not.toContain("RAW-SENSITIVE")
    s.http.expectNone(() => true)
  })

  it("forwards caller cancellation without a delivered catalog or orphan retry", () => {
    const s = setupScheduling(),
      delivered = vi.fn()
    const subscription = s.source.getActiveReschedulingReasons().subscribe(delivered)
    try {
      const request = s.http.expectOne(reasonsUrl)
      subscription.unsubscribe()
      expect(request.cancelled).toBe(true)
      expect(delivered).not.toHaveBeenCalled()
      s.http.expectNone(() => true)
    } finally {
      subscription.unsubscribe()
    }
  })

  it.each(["server", "unconfigured"] as const)("dispatches zero %s catalog HTTP", async mode => {
    const s = setupScheduling(mode === "server", mode === "unconfigured" ? null : undefined)
    expect(await firstValueFrom(s.source.getActiveReschedulingReasons())).toMatchObject({
      success: false,
      error: { code: "UNCONFIGURED" }
    })
    s.http.expectNone(() => true)
  })
})
