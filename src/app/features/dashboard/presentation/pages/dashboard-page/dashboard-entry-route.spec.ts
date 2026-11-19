import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, of } from "rxjs"
import { afterEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ADMIN_ROUTES } from "@/app/experiences/admin/admin.routes"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { DASHBOARD_ROUTES } from "../../../dashboard.routes"
import { provideDashboardReads } from "../../../dashboard.providers"

const endpoint = "https://api.example.test/api/dashboard"
const identity = AuthSession.create("Caller", "caller@example.test", null, 4102444800000, 19)

const wire = () => ({
  generadoEn: "2026-02-11T09:15:00-05:00",
  actual: {
    ordenesPorEstado: { PENDIENTE: 2 },
    serviciosHoy: 6,
    serviciosProximos7Dias: 21,
    ordenesSinProgramar: 4,
    solicitudesPorAtender: 3,
    atencionesAbiertas: 1,
    serviciosPorDia: [],
    cargaProximos7Dias: []
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

// Destination kept for the guest redirect contract of the preserved guard.
@Component({ template: "Login destination" })
class AdminEntryRouteSpecLogin {}

async function setup() {
  const session = new BehaviorSubject<AuthSession | null>(identity)
  TestBed.configureTestingModule({
    providers: [
      provideRouter([...ADMIN_ROUTES, { path: "login", component: AdminEntryRouteSpecLogin }]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideDashboardReads(),
      { provide: API_URL, useValue: "https://api.example.test" },
      { provide: PLATFORM_ID, useValue: "browser" },
      {
        provide: AuthStore,
        useValue: {
          session: () => session.value,
          restoreSession: () => of(session.value),
          logout: () => undefined
        }
      },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } }
    ]
  })
  const harness = await RouterTestingHarness.create("/admin")
  const http = TestBed.inject(HttpTestingController)
  harness.detectChanges()
  await harness.fixture.whenStable()
  harness.detectChanges()
  return { harness, http, element: harness.routeNativeElement! }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    TestBed.resetTestingModule()
  }
})

// W4 / S2: `/admin` opens P02 and no longer redirects to users; nothing else moves.
describe("Admin dashboard entry route", () => {
  it("lazily serves the dashboard at the empty admin path instead of redirecting to users", async () => {
    const children = ADMIN_ROUTES[0].children!
    const entry = children.find(route => route.path === "")
    expect(entry, "Missing empty admin route").toBeDefined()
    expect(entry!.redirectTo).toBeUndefined()
    expect(entry!.pathMatch).toBe("full")
    expect(entry!.loadChildren).toBeTypeOf("function")
    expect(await entry!.loadChildren!()).toBe(DASHBOARD_ROUTES)
    expect(DASHBOARD_ROUTES).toHaveLength(1)
    expect(DASHBOARD_ROUTES[0].canActivate).toHaveLength(1)

    const app = await setup()
    expect(TestBed.inject(Router).url).toBe("/admin")
    const shell = app.element
    expect(shell.tagName.toLowerCase()).toBe("app-admin-shell")
    expect(shell.querySelectorAll("app-admin-sidebar")).toHaveLength(1)
    // The dashboard replaces the previous users destination inside the same shell.
    expect(shell.querySelector("app-dashboard-page")).not.toBeNull()
    expect(shell.querySelector("app-users-page")).toBeNull()
    expect(shell.querySelector("app-catalog-frame")).not.toBeNull()

    const request = app.http.expectOne(candidate => candidate.url === endpoint)
    expect(request.request.method).toBe("GET")
    request.flush(wire())
    await app.harness.fixture.whenStable()
    app.harness.detectChanges()
    expect(shell.textContent).toContain("Panel operativo")
    expect(shell.textContent).toContain("12500.5")
    app.http.expectNone(() => true)
  })

  it("keeps every other admin child route unchanged", () => {
    const children = ADMIN_ROUTES[0].children!
    const paths = children.map(route => route.path).filter(path => path !== "")
    expect(paths).toEqual(["users", "customers", "staff", "operations", "support"])
    for (const path of paths) {
      expect(children.find(route => route.path === path)?.loadChildren).toBeTypeOf("function")
    }
    expect(children.filter(route => route.redirectTo !== undefined)).toHaveLength(0)
  })
})
