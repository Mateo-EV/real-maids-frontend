import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { Result } from "@/app/shared/utils/result"
import { DashboardErrorCode } from "../../domain/errors/dashboard.error"
import { DashboardParams } from "../../domain/params/dashboard.params"
import { DashboardHttpSource } from "./dashboard-http.source"

const endpoint = "https://api.example.test/api/dashboard"

interface WireLoad {
  idPersonal: number
  nombre: string
  servicios: number
  horas: number
}
interface WireActual {
  ordenesPorEstado: Record<string, number>
  serviciosHoy: number
  serviciosProximos7Dias: number
  ordenesSinProgramar: number
  solicitudesPorAtender: number
  atencionesAbiertas: number
  serviciosPorDia: { fecha: string; servicios: number }[]
  cargaProximos7Dias: WireLoad[]
}
interface WirePeriod {
  desde: string
  hasta: string
  solicitudesRegistradas: number
  ordenesCreadas: number
  ordenesCompletadas: number
  ordenesCanceladas: number
  tasaCumplimiento: number | null
  montoCompletado: number
  quejas: number
}
/** Verified wire body of `DashboardResponse{generadoEn, actual, periodo}`. */
interface Wire {
  generadoEn?: string
  actual: WireActual
  periodo: WirePeriod
}

const wire = (): Wire => ({
  generadoEn: "2026-02-11T09:15:00-05:00",
  actual: {
    ordenesPorEstado: { PENDIENTE: 4, PROGRAMADA: 2, COMPLETADA: 17, CANCELADA: 0 },
    serviciosHoy: 6,
    serviciosProximos7Dias: 21,
    ordenesSinProgramar: 4,
    solicitudesPorAtender: 3,
    atencionesAbiertas: 1,
    serviciosPorDia: [
      { fecha: "2026-02-11", servicios: 6 },
      { fecha: "2026-02-12", servicios: 3 }
    ],
    cargaProximos7Dias: [
      { idPersonal: 7, nombre: "Ana Torres", servicios: 11, horas: 38.5 },
      { idPersonal: 9, nombre: "Luis Peña", servicios: 10, horas: 41 }
    ]
  },
  periodo: {
    desde: "2026-01-12",
    hasta: "2026-02-11",
    solicitudesRegistradas: 24,
    ordenesCreadas: 19,
    ordenesCompletadas: 17,
    ordenesCanceladas: 2,
    tasaCumplimiento: 89.47,
    montoCompletado: 12500.5,
    quejas: 1
  }
})

const body = (change: (value: Wire) => void = () => undefined): Wire => {
  const value = wire()
  change(value)
  return value
}

describe("Dashboard HTTP source", () => {
  let http: HttpTestingController
  let source: DashboardHttpSource

  const given = (
    platform: "browser" | "server" = "browser",
    apiUrl: string | null = "https://api.example.test"
  ) => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: platform },
        { provide: API_URL, useValue: apiUrl }
      ]
    })
    http = TestBed.inject(HttpTestingController)
    source = TestBed.inject(DashboardHttpSource)
  }

  const read = (params: DashboardParams = {}) => firstValueFrom(source.getDashboard(params))
  const codeOf = (result: Result<unknown, { code: DashboardErrorCode }>) => {
    expect(result.success).toBe(false)
    if (result.success) throw new Error("expected a failure")
    return result.error.code
  }

  beforeEach(() => given())

  afterEach(() => {
    try {
      http.verify()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it("omits both optional dates when the window is not narrowed", async () => {
    const pending = read()
    const request = http.expectOne(candidate => candidate.url === endpoint)
    expect(request.request.method).toBe("GET")
    expect(request.request.params.keys()).toEqual([])
    request.flush(body())
    expect((await pending).success).toBe(true)
  })

  it("maps optional dates to desde/hasta and treats blank values as absent", async () => {
    const pending = read({ fromDate: "2026-01-12", toDate: "2026-02-11" })
    const narrowed = http.expectOne(candidate => candidate.url === endpoint)
    expect(narrowed.request.params.get("desde")).toBe("2026-01-12")
    expect(narrowed.request.params.get("hasta")).toBe("2026-02-11")
    narrowed.flush(body())
    await pending

    const blank = read({ fromDate: "  ", toDate: "2026-02-11" })
    const partial = http.expectOne(candidate => candidate.url === endpoint)
    expect(partial.request.params.has("desde")).toBe(false)
    expect(partial.request.params.get("hasta")).toBe("2026-02-11")
    partial.flush(body())
    await blank
  })

  it("rejects a malformed or inverted pair as VALIDATION without dispatching", async () => {
    expect(codeOf(await read({ fromDate: "2026-02-30" }))).toBe("VALIDATION")
    expect(codeOf(await read({ fromDate: "12/01/2026" }))).toBe("VALIDATION")
    expect(codeOf(await read({ toDate: "2026-1-2" }))).toBe("VALIDATION")
    expect(codeOf(await read({ fromDate: "2026-02-11", toDate: "2026-01-12" }))).toBe("VALIDATION")
    expect(codeOf(await read({ fromDate: 20260211 as unknown as string }))).toBe("VALIDATION")
    http.expectNone(() => true)
  })

  it("decodes the whole response into the domain view", async () => {
    const pending = read()
    http.expectOne(candidate => candidate.url === endpoint).flush(body())
    const result = await pending
    if (!result.success) throw new Error(result.error.code)

    const view = result.data
    expect(view.generatedAt).toEqual(new Date("2026-02-11T09:15:00-05:00"))
    // The state map is preserved as received: absent codes are never invented.
    expect(view.current.ordersByState).toEqual({
      PENDIENTE: 4,
      PROGRAMADA: 2,
      COMPLETADA: 17,
      CANCELADA: 0
    })
    expect(Object.keys(view.current.ordersByState)).toEqual([
      "PENDIENTE",
      "PROGRAMADA",
      "COMPLETADA",
      "CANCELADA"
    ])
    expect(view.current.servicesToday).toBe(6)
    expect(view.current.servicesNext7Days).toBe(21)
    expect(view.current.unscheduledOrders).toBe(4)
    expect(view.current.requestsPending).toBe(3)
    expect(view.current.openSupportRequests).toBe(1)
    expect(view.current.servicesPerDay).toEqual([
      { date: "2026-02-11", services: 6 },
      { date: "2026-02-12", services: 3 }
    ])
    expect(view.current.next7DaysLoad).toEqual([
      { staffId: 7, name: "Ana Torres", services: 11, hours: "38.5" },
      { staffId: 9, name: "Luis Peña", services: 10, hours: "41" }
    ])
    expect(view.period).toEqual({
      fromDate: "2026-01-12",
      toDate: "2026-02-11",
      requestsRegistered: 24,
      ordersCreated: 19,
      ordersCompleted: 17,
      ordersCancelled: 2,
      complianceRate: "89.47",
      completedAmount: "12500.5",
      complaints: 1
    })
  })

  it("preserves a null compliance rate and the supplied decimal text", async () => {
    const pending = read()
    http
      .expectOne(candidate => candidate.url === endpoint)
      .flush(
        body(value => {
          value.periodo.tasaCumplimiento = null
          value.periodo.montoCompletado = 0
          value.actual.cargaProximos7Dias[1].horas = 0.25
        })
      )
    const result = await pending
    if (!result.success) throw new Error(result.error.code)
    expect(result.data.period.complianceRate).toBeNull()
    expect(result.data.period.completedAmount).toBe("0")
    expect(result.data.current.next7DaysLoad[1].hours).toBe("0.25")
  })

  it("rejects an unknown shape, an unknown state code and a negative count", async () => {
    const cases: ((value: Wire) => void)[] = [
      value => {
        delete value.generadoEn
      },
      value => {
        value.actual.ordenesPorEstado["PENDIENTE_EXTRA"] = 1
      },
      value => {
        value.actual.ordenesPorEstado["PENDIENTE"] = -1
      },
      value => {
        value.actual.serviciosHoy = 2.5
      },
      value => {
        value.actual.serviciosPorDia[0].fecha = "2026-02-31"
      },
      value => {
        value.actual.serviciosPorDia = { fecha: "2026-02-11", servicios: 1 } as unknown as {
          fecha: string
          servicios: number
        }[]
      },
      value => {
        value.actual.cargaProximos7Dias[0].idPersonal = 0
      },
      value => {
        value.actual.cargaProximos7Dias = {} as unknown as WireLoad[]
      },
      value => {
        value.periodo.quejas = -3
      },
      value => {
        value.periodo.desde = "ayer"
      }
    ]
    for (const change of cases) {
      const pending = read()
      http.expectOne(candidate => candidate.url === endpoint).flush(body(change))
      expect(codeOf(await pending)).toBe("INVALID_RESPONSE")
    }
  })

  it("rejects a malformed decimal instead of coercing it", async () => {
    const cases: ((value: Wire) => void)[] = [
      value => {
        value.periodo.montoCompletado = "12500.50" as unknown as number
      },
      value => {
        value.periodo.montoCompletado = -1
      },
      value => {
        value.actual.cargaProximos7Dias[0].horas = null as unknown as number
      },
      value => {
        value.periodo.tasaCumplimiento = "89.47" as unknown as number
      },
      value => {
        value.periodo.montoCompletado = Number.POSITIVE_INFINITY
      }
    ]
    for (const change of cases) {
      const pending = read()
      http.expectOne(candidate => candidate.url === endpoint).flush(body(change))
      expect(codeOf(await pending)).toBe("INVALID_RESPONSE")
    }
  })

  it("maps 401, 403 and 500 to the documented error codes without inventing data", async () => {
    const statuses: [number, DashboardErrorCode][] = [
      [401, "UNAUTHENTICATED"],
      [403, "FORBIDDEN"],
      [500, "UNAVAILABLE"]
    ]
    for (const [status, expected] of statuses) {
      const pending = read()
      http
        .expectOne(candidate => candidate.url === endpoint)
        .flush({ message: "no" }, { status, statusText: "error" })
      expect(codeOf(await pending)).toBe(expected)
    }
  })

  it("dispatches nothing on the server or without a configured origin", async () => {
    given("server")
    expect(codeOf(await read())).toBe("UNAVAILABLE")
    http.expectNone(() => true)

    given("browser", null)
    expect(codeOf(await read())).toBe("UNAVAILABLE")
    http.expectNone(() => true)
  })
})
