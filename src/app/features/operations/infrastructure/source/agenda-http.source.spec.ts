import { HttpClient, HttpErrorResponse } from "@angular/common/http"
import { HttpTestingController } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, throwError } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import {
  agendaDto,
  agendaEntry,
  agendaQuery,
  agendaUrl,
  corruptQuery,
  corruptQueryShape,
  setupAgenda
} from "./agenda-http.testing"

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

function expectFailure(value: unknown, code: string) {
  expect(value).toMatchObject({ success: false, error: { code } })
  expect(JSON.stringify(value)).not.toContain("RAW BACKEND DETAIL")
}

const requestMatches = (url: string) => url === agendaUrl

describe("T7A standalone agenda public DI/HTTP RED contract", () => {
  it("captures only from/until/staffId at call time and sends one cold exact GET without preflight", async () => {
    const s = setupAgenda()
    const query = {
      ...agendaQuery(),
      staffId: 7,
      get ignored(): never {
        throw Error("extra fields must not be read")
      }
    }
    const operation = s.source.getAgenda(query)
    query.from = "2030-01-01"
    query.until = "2030-01-02"
    query.staffId = 99
    s.http.expectNone(() => true)
    const pending = firstValueFrom(operation)
    const request = s.http.expectOne(r => requestMatches(r.url))
    expect(request.request.method).toBe("GET")
    expect(request.request.body).toBeNull()
    expect(request.request.transferCache).toBe(false)
    expect(request.request.params.keys().sort()).toEqual(["desde", "hasta", "idPersonal"])
    expect(request.request.params.get("desde")).toBe("2024-02-29")
    expect(request.request.params.get("hasta")).toBe("2024-03-01")
    expect(request.request.params.get("idPersonal")).toBe("7")
    s.http.expectNone(() => true)
    // Backend own-scope override is authoritative: returned staff need not match 7.
    request.flush([agendaDto()])
    expect(await pending).toEqual(Result.success([agendaEntry()]))
    s.http.expectNone(() => true)
  })

  it.each([
    ["2024-02-29", "2024-02-29"],
    ["2024-01-01", "2024-03-02"],
    ["2023-12-31", "2024-01-01"],
    ["2000-02-29", "2000-03-01"]
  ])(
    "accepts real civil range %s through %s, including zero and 61-day differences",
    async (from, until) => {
      const s = setupAgenda()
      const pending = firstValueFrom(s.source.getAgenda({ from, until }))
      const request = s.http.expectOne(r => r.url === agendaUrl)
      expect(request.request.params.keys().sort()).toEqual(["desde", "hasta"])
      expect(request.request.params.get("desde")).toBe(from)
      expect(request.request.params.get("hasta")).toBe(until)
      request.flush([])
      expect(await pending).toEqual(Result.success([]))
    }
  )

  it.each([1, 2147483647])("accepts optional positive int32 staff boundary %s", async staffId => {
    const s = setupAgenda()
    const pending = firstValueFrom(s.source.getAgenda({ ...agendaQuery(), staffId }))
    const request = s.http.expectOne(r => r.url === agendaUrl)
    expect(request.request.params.get("idPersonal")).toBe(String(staffId))
    request.flush([])
    expect(await pending).toEqual(Result.success([]))
  })

  it.each<[string, unknown]>([
    ["from", undefined],
    ["until", undefined],
    ["from", null],
    ["from", "2023-02-29"],
    ["from", "1900-02-29"],
    ["from", "2024-04-31"],
    ["from", "2024-00-01"],
    ["until", "2024-13-01"],
    ["from", "2024-02-00"],
    ["from", "2024-2-29"],
    ["from", " 2024-02-29"],
    ["from", "2024-02-29T00:00:00Z"],
    ["from", 20240229],
    ["from", "2024-03-02"],
    ["until", "2024-05-01"], // Feb 29 to May 1 is 62 days: rejected, not clamped.
    ["staffId", 0],
    ["staffId", -1],
    ["staffId", 1.5],
    ["staffId", 2147483648],
    ["staffId", NaN],
    ["staffId", Infinity],
    ["staffId", "7"],
    ["staffId", null]
  ])("rejects invalid query %s=%s as safe INVALID_DATA without HTTP", async (field, value) => {
    const s = setupAgenda()
    const result = await firstValueFrom(s.source.getAgenda(corruptQuery(field, value)))
    expectFailure(result, "INVALID_DATA")
    s.http.expectNone(() => true)
  })

  it.each([null, undefined, [], "dates", 12])(
    "rejects malformed query shape %s without throwing",
    async value => {
      const s = setupAgenda()
      const operation = s.source.getAgenda(corruptQueryShape(value))
      expectFailure(await firstValueFrom(operation), "INVALID_DATA")
      s.http.expectNone(() => true)
    }
  )

  it.each(["from", "until", "staffId"])(
    "captures throwing %s getter safely at method call",
    async field => {
      const s = setupAgenda()
      const query = agendaQuery()
      Object.defineProperty(query, field, {
        get() {
          throw Error("RAW BACKEND DETAIL")
        }
      })
      const operation = s.source.getAgenda(query)
      expectFailure(await firstValueFrom(operation), "INVALID_DATA")
      s.http.expectNone(() => true)
    }
  )

  it("preserves server row/staff order, open codes, nullable fields and simple order IDs without extra identities", async () => {
    const s = setupAgenda()
    const first = agendaDto()
    const second = {
      ...agendaDto(),
      idOrden: 1,
      horaInicio: "00:00",
      horaFin: "00:00:00.1",
      tipoServicio: "  <b>Literal type</b>  "
    }
    second.asignados = [
      { idPersonal: 20, nombre: "Second", telefono: "", rol: "apoyo" },
      { idPersonal: 2, nombre: "First", telefono: "  555  ", rol: "responsable" }
    ]
    const pending = firstValueFrom(s.source.getAgenda(agendaQuery()))
    s.http.expectOne(r => r.url === agendaUrl).flush([first, second])
    expect(await pending).toEqual(
      Result.success([
        agendaEntry(),
        {
          ...agendaEntry(),
          orderId: 1,
          startTime: "00:00",
          endTime: "00:00:00.1",
          serviceTypeName: "  <b>Literal type</b>  ",
          assignedStaff: [
            { staffId: 20, name: "Second", phone: "", role: "apoyo" },
            { staffId: 2, name: "First", phone: "  555  ", role: "responsable" }
          ]
        }
      ])
    )
  })

  it.each(["", "   "])(
    "preserves nullable text's legitimate non-null literal value '%s'",
    async text => {
      const s = setupAgenda()
      const dto = agendaDto()
      Reflect.set(dto, "tipoServicio", text)
      Reflect.set(dto.asignados[0], "telefono", text)
      const pending = firstValueFrom(s.source.getAgenda(agendaQuery()))
      s.http.expectOne(r => r.url === agendaUrl).flush([dto])
      expect(await pending).toEqual(
        Result.success([
          {
            ...agendaEntry(),
            serviceTypeName: text,
            assignedStaff: [{ ...agendaEntry().assignedStaff[0], phone: text }]
          }
        ])
      )
    }
  )

  it.each(["00:00", "23:59:59", "23:59:59.123456789"])(
    "preserves literal clock precision %s without instant/end-order rules",
    async clock => {
      const s = setupAgenda()
      const dto = { ...agendaDto(), horaInicio: clock, horaFin: "00:00" }
      const pending = firstValueFrom(s.source.getAgenda(agendaQuery()))
      s.http.expectOne(r => r.url === agendaUrl).flush([dto])
      expect(await pending).toEqual(
        Result.success([{ ...agendaEntry(), startTime: clock, endTime: "00:00" }])
      )
    }
  )

  it.each([null, {}, "rows", { contenido: [] }, [null], [[]]])(
    "rejects unknown non-array/row response %s as a whole",
    async body => {
      const s = setupAgenda()
      const pending = firstValueFrom(s.source.getAgenda(agendaQuery()))
      s.http.expectOne(r => r.url === agendaUrl).flush(body)
      expectFailure(await pending, "INVALID_RESPONSE")
    }
  )

  it.each<[string, unknown]>([
    ["idOrden", 0],
    ["idOrden", 2147483648],
    ["idOrden", 1.5],
    ["idOrden", "17"],
    ["fecha", "2023-02-29"],
    ["fecha", "2024-04-31"],
    ["fecha", "2024-02-29T00:00:00Z"],
    ["horaInicio", null],
    ["horaInicio", "24:00"],
    ["horaInicio", "12:60"],
    ["horaInicio", "12:00:60"],
    ["horaInicio", "12:00:00.1234567890"],
    ["horaFin", "08:00Z"],
    ["horaFin", "8:00"],
    ["codigo", "   "],
    ["estado", ""],
    ["cliente", null],
    ["propiedad", ""],
    ["tipoServicio", 42],
    ["asignados", null],
    ["asignados", {}]
  ])(
    "rejects malformed row %s=%s without dropping it or fabricating empty success",
    async (field, value) => {
      const s = setupAgenda()
      const dto = agendaDto()
      Reflect.set(dto, field, value)
      const pending = firstValueFrom(s.source.getAgenda(agendaQuery()))
      s.http.expectOne(r => r.url === agendaUrl).flush([agendaDto(), dto])
      expectFailure(await pending, "INVALID_RESPONSE")
    }
  )

  it.each<[string, unknown]>([
    ["idPersonal", 0],
    ["idPersonal", 2147483648],
    ["idPersonal", 1.5],
    ["idPersonal", "9"],
    ["nombre", "  "],
    ["telefono", 123],
    ["rol", null],
    ["rol", ""]
  ])("rejects malformed assigned staff %s=%s", async (field, value) => {
    const s = setupAgenda()
    const dto = agendaDto()
    Reflect.set(dto.asignados[0], field, value)
    const pending = firstValueFrom(s.source.getAgenda(agendaQuery()))
    s.http.expectOne(r => r.url === agendaUrl).flush([dto])
    expectFailure(await pending, "INVALID_RESPONSE")
  })

  it.each([null, [], {}])("rejects unknown assigned staff row %s", async value => {
    const s = setupAgenda()
    const dto = agendaDto()
    Reflect.set(dto, "asignados", [value])
    const pending = firstValueFrom(s.source.getAgenda(agendaQuery()))
    s.http.expectOne(r => r.url === agendaUrl).flush([dto])
    expectFailure(await pending, "INVALID_RESPONSE")
  })

  it("preserves a verified entry with an empty assigned staff list", async () => {
    const s = setupAgenda()
    const dto = agendaDto()
    dto.asignados = []
    const pending = firstValueFrom(s.source.getAgenda(agendaQuery()))
    s.http.expectOne(r => r.url === agendaUrl).flush([dto])
    expect(await pending).toEqual(Result.success([{ ...agendaEntry(), assignedStaff: [] }]))
  })

  it("rejects duplicate staff IDs within one entry", async () => {
    const s = setupAgenda()
    const dto = agendaDto()
    dto.asignados.push({ ...dto.asignados[0] })
    const pending = firstValueFrom(s.source.getAgenda(agendaQuery()))
    s.http.expectOne(r => r.url === agendaUrl).flush([dto])
    expectFailure(await pending, "INVALID_RESPONSE")
  })

  it.each<[number, string]>([
    [400, "INVALID_DATA"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "NOT_FOUND"],
    [409, "CONFLICT"],
    [500, "UNAVAILABLE"]
  ])("maps HTTP %s to safe %s without raw errors or retry", async (status, code) => {
    const s = setupAgenda()
    const pending = firstValueFrom(s.source.getAgenda(agendaQuery()))
    s.http
      .expectOne(r => r.url === agendaUrl)
      .flush({ mensaje: "RAW BACKEND DETAIL" }, { status, statusText: "RAW BACKEND DETAIL" })
    expectFailure(await pending, code)
    s.http.expectNone(() => true)
  })

  it("maps network failure to safe UNAVAILABLE without retry", async () => {
    const s = setupAgenda()
    const pending = firstValueFrom(s.source.getAgenda(agendaQuery()))
    s.http.expectOne(r => r.url === agendaUrl).error(new ProgressEvent("error"))
    expectFailure(await pending, "UNAVAILABLE")
    s.http.expectNone(() => true)
  })

  it("maps successful-status JSON parse failure to INVALID_RESPONSE", async () => {
    const s = setupAgenda()
    vi.spyOn(TestBed.inject(HttpClient), "get").mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 200, error: Error("RAW BACKEND DETAIL") }))
    )
    expectFailure(await firstValueFrom(s.source.getAgenda(agendaQuery())), "INVALID_RESPONSE")
    s.http.expectNone(() => true)
  })

  it.each(["server", "unconfigured"])(
    "dispatches no HTTP when %s, without auth initialization",
    async mode => {
      const s = setupAgenda(
        mode === "server" ? "server" : "browser",
        mode === "unconfigured" ? null : "https://api.example.test"
      )
      expectFailure(await firstValueFrom(s.source.getAgenda(agendaQuery())), "UNCONFIGURED")
      s.http.expectNone(() => true)
    }
  )

  it("cancels only the unsubscribed caller and does not share/cache explicit observations", async () => {
    const s = setupAgenda()
    const operation = s.source.getAgenda(agendaQuery())
    const first = operation.subscribe()
    const firstRequest = s.http.expectOne(r => r.url === agendaUrl)
    const second = firstValueFrom(operation)
    const secondRequest = s.http.expectOne(r => r.url === agendaUrl)
    first.unsubscribe()
    expect(firstRequest.cancelled).toBe(true)
    expect(secondRequest.cancelled).toBe(false)
    secondRequest.flush([])
    expect(await second).toEqual(Result.success([]))
    const repeated = firstValueFrom(operation)
    s.http.expectOne(r => r.url === agendaUrl).flush([])
    expect(await repeated).toEqual(Result.success([]))
  })
})
