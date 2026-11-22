import { PLATFORM_ID } from "@angular/core"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { StaffAbsencesHttpSource } from "./staff-absences-http.source"

const stamp = "2026-04-01T10:00:00Z"

/** The documented `AusenciaResponse` shape: dates are inclusive calendar days, no clock. */
function dto(overrides: Record<string, unknown> = {}) {
  return {
    idAusencia: 9,
    idPersonal: 21,
    nombrePersonal: "Personal 21",
    fechaInicio: "2026-04-06",
    fechaFin: "2026-04-08",
    dias: 3,
    motivo: "Viaje familiar",
    estado: "PENDIENTE",
    observacionResolucion: null,
    fechaRegistro: stamp,
    fechaResolucion: null,
    ...overrides
  }
}

function page(contenido: unknown[] = [dto()], pagina = 0, tamanio = 20, totalElementos = 1) {
  return {
    contenido,
    pagina,
    tamanio,
    totalElementos,
    totalPaginas: Math.ceil(totalElementos / tamanio)
  }
}

function setup(options: { url?: string | null; server?: boolean } = {}) {
  TestBed.resetTestingModule()
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: API_URL,
        useValue: options.url === undefined ? "http://localhost:8080" : options.url
      },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" }
    ]
  })
  return TestBed.inject(StaffAbsencesHttpSource)
}

describe("Staff absence HTTP reads", () => {
  let source: StaffAbsencesHttpSource, http: HttpTestingController
  beforeEach(() => {
    source = setup()
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())

  it("reads one default server page and decodes the documented projection", async () => {
    const pending = firstValueFrom(source.getAbsences())
    const request = http.expectOne("http://localhost:8080/api/ausencias?pagina=0&tamanio=20")
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    request.flush(page())
    expect(await pending).toEqual({
      success: true,
      data: {
        total: 1,
        offset: 0,
        limit: 20,
        items: [
          {
            id: 9,
            staffId: 21,
            staffName: "Personal 21",
            startDate: "2026-04-06",
            endDate: "2026-04-08",
            days: 3,
            reason: "Viaje familiar",
            status: "PENDIENTE",
            resolutionObservation: null,
            registeredAt: new Date(stamp),
            resolvedAt: null
          }
        ]
      }
    })
  })

  it("sends only the supplied filters over the closed status set", async () => {
    const pending = firstValueFrom(
      source.getAbsences({
        offset: 20,
        limit: 10,
        status: "APROBADA",
        staffId: 21,
        from: "2026-04-01",
        until: "2026-04-30"
      })
    )
    const request = http.expectOne(
      "http://localhost:8080/api/ausencias?pagina=2&tamanio=10&estado=APROBADA&idPersonal=21&desde=2026-04-01&hasta=2026-04-30"
    )
    request.flush(page([], 2, 10, 0))
    expect(await pending).toEqual({
      success: true,
      data: { total: 0, offset: 20, limit: 10, items: [] }
    })
  })

  it("refuses an unaligned or malformed query before any dispatch", async () => {
    const unaligned = await firstValueFrom(source.getAbsences({ offset: 5, limit: 10 }))
    expect(unaligned).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    const unknownStatus = await firstValueFrom(source.getAbsences({ status: "DUDOSA" as never }))
    expect(unknownStatus).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    const backwards = await firstValueFrom(
      source.getAbsences({ from: "2026-05-01", until: "2026-04-01" })
    )
    expect(backwards).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    http.expectNone(() => true)
  })

  it("rejects a page whose effective metadata does not describe the requested page", async () => {
    const pending = firstValueFrom(source.getAbsences())
    http
      .expectOne("http://localhost:8080/api/ausencias?pagina=0&tamanio=20")
      .flush(page([], 1, 20, 0))
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })

  it("rejects an unknown status, an empty reason and an impossible day count", async () => {
    for (const broken of [
      dto({ estado: "OLVIDADA" }),
      dto({ motivo: "   " }),
      dto({ dias: 0 }),
      dto({ fechaInicio: "2026-02-30" })
    ]) {
      source = setup()
      http = TestBed.inject(HttpTestingController)
      const pending = firstValueFrom(source.getAbsences())
      http
        .expectOne("http://localhost:8080/api/ausencias?pagina=0&tamanio=20")
        .flush(page([broken]))
      expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
      http.verify()
    }
  })

  it("reads one absence by its positive int32 id and maps a documented 404", async () => {
    const pending = firstValueFrom(source.getAbsenceById(9))
    const request = http.expectOne("http://localhost:8080/api/ausencias/9")
    expect(request.request.method).toBe("GET")
    request.flush(dto({ estado: "APROBADA", fechaResolucion: stamp, observacionResolucion: "Ok" }))
    expect(await pending).toMatchObject({
      success: true,
      data: { id: 9, status: "APROBADA", resolvedAt: new Date(stamp) }
    })
    const missing = firstValueFrom(source.getAbsenceById(10))
    http
      .expectOne("http://localhost:8080/api/ausencias/10")
      .flush({ message: "no" }, { status: 404, statusText: "Not Found" })
    expect(await missing).toMatchObject({ success: false, error: { code: "NOT_FOUND" } })
    expect(await firstValueFrom(source.getAbsenceById(0))).toMatchObject({
      success: false,
      error: { code: "INVALID_DATA" }
    })
  })

  it("enforces the documented response bounds: motivo 500 and observación 250", async () => {
    const cases: Array<{ overrides: Record<string, unknown>; accepted: boolean }> = [
      { overrides: { motivo: "m".repeat(500) }, accepted: true },
      { overrides: { motivo: "m".repeat(501) }, accepted: false },
      {
        overrides: {
          estado: "RECHAZADA",
          observacionResolucion: "o".repeat(250),
          fechaResolucion: stamp
        },
        accepted: true
      },
      {
        overrides: {
          estado: "RECHAZADA",
          observacionResolucion: "o".repeat(251),
          fechaResolucion: stamp
        },
        accepted: false
      }
    ]
    for (const { overrides, accepted } of cases) {
      source = setup()
      http = TestBed.inject(HttpTestingController)
      const pending = firstValueFrom(source.getAbsences())
      http
        .expectOne("http://localhost:8080/api/ausencias?pagina=0&tamanio=20")
        .flush(page([dto(overrides)]))
      const result = await pending
      expect(result.success).toBe(accepted)
      if (!accepted) expect(result).toMatchObject({ error: { code: "INVALID_RESPONSE" } })
      http.verify()
    }
  })

  it("dispatches nothing without a configured API origin or on the server platform", async () => {
    source = setup({ url: null })
    http = TestBed.inject(HttpTestingController)
    expect(await firstValueFrom(source.getAbsences())).toMatchObject({
      success: false,
      error: { code: "UNCONFIGURED" }
    })
    http.expectNone(() => true)
    source = setup({ server: true })
    http = TestBed.inject(HttpTestingController)
    expect(await firstValueFrom(source.getAbsenceById(1))).toMatchObject({
      success: false,
      error: { code: "UNCONFIGURED" }
    })
    http.expectNone(() => true)
  })
})

describe("Staff absence HTTP writes", () => {
  let source: StaffAbsencesHttpSource, http: HttpTestingController
  beforeEach(() => {
    source = setup()
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())

  it("requests an own absence with only the documented body", async () => {
    const pending = firstValueFrom(
      source.createAbsence({ startDate: "2026-04-06", endDate: "2026-04-08", reason: "  Viaje  " })
    )
    const request = http.expectOne("http://localhost:8080/api/ausencias")
    expect(request.request.method).toBe("POST")
    expect(request.request.body).toEqual({
      fechaInicio: "2026-04-06",
      fechaFin: "2026-04-08",
      motivo: "Viaje"
    })
    request.flush(dto())
    expect(await pending).toMatchObject({ success: true, data: { id: 9, status: "PENDIENTE" } })
  })

  it("refuses a blank reason, a reversed range and a malformed day before any dispatch", async () => {
    for (const params of [
      { startDate: "2026-04-06", endDate: "2026-04-08", reason: "   " },
      { startDate: "2026-04-09", endDate: "2026-04-08", reason: "Viaje" },
      { startDate: "2026-04-31", endDate: "2026-05-01", reason: "Viaje" }
    ]) {
      expect(await firstValueFrom(source.createAbsence(params))).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
    }
    http.expectNone(() => true)
  })

  it("accepts exactly 500 characters of motivo and refuses 501 before any dispatch", async () => {
    const accepted = firstValueFrom(
      source.createAbsence({
        startDate: "2026-04-06",
        endDate: "2026-04-08",
        reason: `  ${"m".repeat(500)}  `
      })
    )
    const request = http.expectOne("http://localhost:8080/api/ausencias")
    // The documented `@Size(max = 500)` applies to the trimmed text that actually travels.
    expect(request.request.body.motivo).toHaveLength(500)
    request.flush(dto({ motivo: "m".repeat(500) }))
    expect(await accepted).toMatchObject({ success: true })

    expect(
      await firstValueFrom(
        source.createAbsence({
          startDate: "2026-04-06",
          endDate: "2026-04-08",
          reason: "m".repeat(501)
        })
      )
    ).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    http.expectNone(() => true)
  })

  it("accepts exactly 250 characters of observación and refuses 251 before any dispatch", async () => {
    const accepted = firstValueFrom(
      source.setAbsenceStatus(9, { status: "APROBADA", observation: `  ${"o".repeat(250)} ` })
    )
    const patch = http.expectOne({
      url: "http://localhost:8080/api/ausencias/9/estado",
      method: "PATCH"
    })
    expect(patch.request.body.observacion).toHaveLength(250)
    patch.flush(dto({ estado: "APROBADA", fechaResolucion: stamp }))
    expect(await accepted).toMatchObject({ success: true })

    expect(
      await firstValueFrom(
        source.setAbsenceStatus(9, { status: "APROBADA", observation: "o".repeat(251) })
      )
    ).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    http.expectNone(() => true)
  })

  it("resolves a status with the closed target set and a nullable observation", async () => {
    const pending = firstValueFrom(
      source.setAbsenceStatus(9, { status: "RECHAZADA", observation: "  Sin cobertura  " })
    )
    const request = http.expectOne("http://localhost:8080/api/ausencias/9/estado")
    expect(request.request.method).toBe("PATCH")
    expect(request.request.body).toEqual({ estado: "RECHAZADA", observacion: "Sin cobertura" })
    request.flush(dto({ estado: "RECHAZADA", fechaResolucion: stamp }))
    expect(await pending).toMatchObject({ success: true, data: { status: "RECHAZADA" } })

    const blank = firstValueFrom(
      source.setAbsenceStatus(9, { status: "CANCELADA", observation: "   " })
    )
    http
      .expectOne("http://localhost:8080/api/ausencias/9/estado")
      .flush(dto({ estado: "CANCELADA", fechaResolucion: stamp }))
    await blank
  })

  it("refuses an invented target status or a non-positive id before any dispatch", async () => {
    for (const params of [
      { status: "PENDIENTE", observation: null },
      { status: "APROBADA", observation: 5 as never },
      { status: "DUDOSA", observation: null }
    ]) {
      expect(await firstValueFrom(source.setAbsenceStatus(9, params as never))).toMatchObject({
        success: false,
        error: { code: "INVALID_DATA" }
      })
    }
    expect(
      await firstValueFrom(source.setAbsenceStatus(0, { status: "APROBADA", observation: null }))
    ).toMatchObject({ success: false, error: { code: "INVALID_DATA" } })
    http.expectNone(() => true)
  })

  it("a blank observation is transported as null, not as an empty string", async () => {
    const pending = firstValueFrom(
      source.setAbsenceStatus(9, { status: "APROBADA", observation: "" })
    )
    const request = http.expectOne("http://localhost:8080/api/ausencias/9/estado")
    expect(request.request.body).toEqual({ estado: "APROBADA", observacion: null })
    request.flush(dto({ estado: "APROBADA", fechaResolucion: stamp }))
    await pending
  })
})
