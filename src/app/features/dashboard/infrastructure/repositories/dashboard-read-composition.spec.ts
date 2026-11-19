import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { GetDashboardUseCase } from "../../application/use-cases/get-dashboard.use-case"
import { DASHBOARD_REPOSITORY } from "../../domain/repositories/dashboard.repository"
import { provideDashboardReads } from "../../dashboard.providers"
import { DashboardHttpSource } from "../source/dashboard-http.source"
import { DashboardRepositoryImpl } from "./dashboard.repository-impl"

const endpoint = "https://api.example.test/api/dashboard"
const wire = () => ({
  generadoEn: "2026-02-11T09:15:00-05:00",
  actual: {
    ordenesPorEstado: { PENDIENTE: 1 },
    serviciosHoy: 0,
    serviciosProximos7Dias: 0,
    ordenesSinProgramar: 0,
    solicitudesPorAtender: 0,
    atencionesAbiertas: 0,
    serviciosPorDia: [],
    cargaProximos7Dias: []
  },
  periodo: {
    desde: "2026-01-12",
    hasta: "2026-02-11",
    solicitudesRegistradas: 0,
    ordenesCreadas: 0,
    ordenesCompletadas: 0,
    ordenesCanceladas: 0,
    // No closures in the window: the backend answers null, not zero.
    tasaCumplimiento: null,
    montoCompletado: 0,
    quejas: 0
  }
})

describe("Dashboard public read composition", () => {
  let http: HttpTestingController
  let useCase: GetDashboardUseCase

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: "browser" },
        { provide: API_URL, useValue: "https://api.example.test" },
        provideDashboardReads()
      ]
    })
    http = TestBed.inject(HttpTestingController)
    useCase = TestBed.inject(GetDashboardUseCase)
  })

  afterEach(() => {
    try {
      http.verify()
    } finally {
      vi.restoreAllMocks()
    }
  })

  it("aliases the domain token to the root implementation, not the root HTTP source", () => {
    const repository = TestBed.inject(DASHBOARD_REPOSITORY)
    expect(repository).toBe(TestBed.inject(DashboardRepositoryImpl))
    expect(repository).not.toBe(TestBed.inject(DashboardHttpSource))
    expect(TestBed.inject(GetDashboardUseCase)).toBe(useCase)
    http.expectNone(() => true)
  })

  it("reads the dashboard through the stateless use case with the narrowed window", async () => {
    const pending = firstValueFrom(useCase.execute({ fromDate: "2026-01-12" }))
    const request = http.expectOne(candidate => candidate.url === endpoint)
    expect(request.request.params.get("desde")).toBe("2026-01-12")
    expect(request.request.params.has("hasta")).toBe(false)
    request.flush(wire())
    const result = await pending
    if (!result.success) throw new Error(result.error.code)
    expect(result.data.period.complianceRate).toBeNull()
    expect(result.data.current.ordersByState).toEqual({ PENDIENTE: 1 })
  })
})
