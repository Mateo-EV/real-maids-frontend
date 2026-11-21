import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { EMPTY, of } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { staffGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideOperationsRequestReads } from "@/app/features/operations/operations.providers"
import { STAFF_ROUTES } from "./staff.routes"

@Component({ selector: "app-admin-destination", template: "<p>Admin destination</p>" })
class AdminDestination {}

@Component({ selector: "app-portal-destination", template: "<p>Portal destination</p>" })
class PortalDestination {}

@Component({ selector: "app-login-destination", template: "<p>Login destination</p>" })
class LoginDestination {}

/** The backend label of the field staff seed role (`PerfilResponse.rol`), no permission inferred. */
const fieldStaff = () =>
  AuthSession.create(
    "Personal Campo",
    "campo@example.test",
    "PERSONAL_CAMPO",
    null,
    11,
    3,
    "es",
    []
  )
const administrator = () =>
  AuthSession.create("Operador", "operador@example.test", "Administrador", null, 3, 2, "es", [])
const customer = () =>
  AuthSession.create("Cliente Portal", "cliente@example.test", "CLIENTE", null, 9, 4, "es", [])

function setup(session: AuthSession | null) {
  TestBed.resetTestingModule()
  const auth = {
    session: signal(session),
    restoreSession: vi.fn(() => of(session)),
    logout: vi.fn(() => auth.session.set(null))
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        ...STAFF_ROUTES,
        { path: "admin", component: AdminDestination },
        { path: "portal", component: PortalDestination },
        { path: "login", component: LoginDestination }
      ]),
      provideHttpClient(),
      provideHttpClientTesting(),
      provideOperationsRequestReads(),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: AuthStore, useValue: auth },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } }
    ]
  })
  return auth
}

const stamp = "2026-03-02T04:30:00-05:00"

function order(id = 17) {
  return {
    idOrden: id,
    codigo: `OS-2026-${String(id).padStart(6, "0")}`,
    estado: "PROGRAMADA",
    estadoNombre: "Programada",
    idSolicitud: 42,
    idCliente: 88,
    cliente: "Cliente Asignado",
    idPropiedad: 31,
    propiedad: "Casa centro",
    idTipoServicio: 4,
    tipoServicio: "Limpieza profunda",
    duracionEstimadaMinutos: 90,
    montoEstimado: 120,
    observacion: null,
    programacion: {
      idProgramacion: 51,
      fecha: "2026-03-12",
      horaInicio: "08:30:00",
      horaFin: "11:00:00",
      vigente: true,
      motivo: null,
      registradoPor: "Operador Propio",
      fechaRegistro: stamp
    },
    asignados: [
      { idPersonal: 21, nombre: "Personal 21", telefono: "+56 9 1111 2222", rol: "RESPONSABLE" }
    ],
    fechaCreacion: stamp,
    fechaActualizacion: null
  }
}

const emptyPage = {
  contenido: [],
  pagina: 0,
  tamanio: 20,
  totalElementos: 0,
  totalPaginas: 0
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    vi.restoreAllMocks()
  }
})

describe("staff routes", () => {
  it("composes one lazy staff experience guarded by the shared audience decision", () => {
    expect(STAFF_ROUTES).toHaveLength(1)
    const staff = STAFF_ROUTES[0]
    expect(staff.path).toBe("staff")
    expect(staff.canActivate).toEqual([staffGuard])
    expect(staff.loadComponent).toBeTypeOf("function")
    const children = staff.children!
    // No dead entries: `/staff` opens the only implemented section.
    expect(children.map(route => route.path)).toEqual(["", "services"])
    expect(children[0].pathMatch).toBe("full")
    expect(children[0].redirectTo).toBe("services")
    expect(children[1].title).toBe("Mis servicios | The Real Maids")
    expect(children[1].loadComponent).toBeTypeOf("function")
    expect(children[1].canActivate).toBeUndefined()
    expect(children[1].providers).toBeUndefined()
  })

  it("protects the staff experience for anonymous visitors without any read or shell", async () => {
    const auth = setup(null)
    const harness = await RouterTestingHarness.create("/staff/services")
    expect(auth.restoreSession).toHaveBeenCalled()
    expect(TestBed.inject(Router).url).toBe("/login?returnUrl=%2Fstaff%2Fservices")
    expect(harness.routeNativeElement?.querySelector("app-staff-shell")).toBeNull()
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })

  it("opens Mis servicios for a field staff session with its own shell and no admin affordance", async () => {
    const auth = setup(fieldStaff())
    const harness = await RouterTestingHarness.create("/staff")
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(TestBed.inject(Router).url).toBe("/staff/services")
    const element = harness.routeNativeElement!
    expect(element.tagName.toLowerCase()).toBe("app-staff-shell")

    // Brand, own session identity and logout; nothing administrative.
    expect(element.querySelector(".brand-mark")?.textContent?.trim()).toBe("RM")
    expect(element.querySelector(".session-controls")?.textContent).toContain("Personal Campo")
    expect(element.querySelector("app-admin-sidebar")).toBeNull()
    expect(element.querySelector(".catalog-metrics")).toBeNull()
    expect(element.querySelectorAll('a[href^="/admin"]')).toHaveLength(0)

    // One real section, marked as the current page.
    const nav = element.querySelector('nav[aria-label="Navegación del personal"]')!
    const links = Array.from(nav.querySelectorAll("a"))
    expect(links).toHaveLength(1)
    expect(links[0].textContent?.trim()).toBe("Mis servicios")
    expect(links[0].getAttribute("href")).toBe("/staff/services")
    expect(links[0].getAttribute("aria-current")).toBe("page")
    expect(element.querySelector("app-staff-services-page")).not.toBeNull()

    const request = TestBed.inject(HttpTestingController).expectOne(
      candidate =>
        candidate.url === "http://localhost:8080/api/ordenes" &&
        candidate.params.get("pagina") === "0" &&
        candidate.params.get("tamanio") === "20"
    )
    // The backend resolves the caller's staff scope: no staff id and no invented filter travels.
    expect(request.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    request.flush(emptyPage)
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(element.textContent).toContain("Aún no tienes servicios asignados")
    TestBed.inject(HttpTestingController).expectNone(() => true)
    expect(auth.session()?.role).toBe("PERSONAL_CAMPO")
  })

  it("sends a backoffice session out of the staff experience", async () => {
    setup(administrator())
    const harness = await RouterTestingHarness.create("/staff/services")
    await harness.fixture.whenStable()
    expect(TestBed.inject(Router).url).toBe("/admin")
    expect(harness.routeNativeElement?.textContent).toContain("Admin destination")
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })

  it("sends a customer session from the staff experience to the portal", async () => {
    setup(customer())
    const harness = await RouterTestingHarness.create("/staff/services")
    await harness.fixture.whenStable()
    expect(TestBed.inject(Router).url).toBe("/portal")
    expect(harness.routeNativeElement?.textContent).toContain("Portal destination")
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })

  it("logs the staff member out from its own shell", async () => {
    const auth = setup(fieldStaff())
    const harness = await RouterTestingHarness.create("/staff/services")
    await harness.fixture.whenStable()
    TestBed.inject(HttpTestingController)
      .expectOne(candidate => candidate.url === "http://localhost:8080/api/ordenes")
      .flush(emptyPage)
    await harness.fixture.whenStable()
    harness.detectChanges()
    const button = Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>("header button")
    ).find(item => item.textContent?.includes("Salir"))!
    button.click()
    await harness.fixture.whenStable()
    expect(auth.logout).toHaveBeenCalledOnce()
    expect(TestBed.inject(Router).url).toBe("/login")
  })

  // Supplied records are rendered, never filtered locally, and the staff surface keeps the server text.
  it("renders the supplied assigned services of the caller", async () => {
    setup(fieldStaff())
    const harness = await RouterTestingHarness.create("/staff/services")
    await harness.fixture.whenStable()
    harness.detectChanges()
    TestBed.inject(HttpTestingController)
      .expectOne(candidate => candidate.url === "http://localhost:8080/api/ordenes")
      .flush({
        contenido: [order()],
        pagina: 0,
        tamanio: 20,
        totalElementos: 1,
        totalPaginas: 1
      })
    await harness.fixture.whenStable()
    harness.detectChanges()
    const text = harness.routeNativeElement!.textContent!
    expect(text).toContain("OS-2026-000017")
    expect(text).toContain("Programada")
    expect(text).toContain("Cliente Asignado")
    expect(text).toContain("Casa centro")
    expect(text).toContain("2026-03-12")
    expect(text).toContain("08:30:00")
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
