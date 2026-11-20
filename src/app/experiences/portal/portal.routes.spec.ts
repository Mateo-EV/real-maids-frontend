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
import { portalGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideOperationsRequestReads } from "@/app/features/operations/operations.providers"
import { PORTAL_ROUTES } from "./portal.routes"

@Component({ selector: "app-admin-destination", template: "<p>Admin destination</p>" })
class AdminDestination {}

@Component({ selector: "app-login-destination", template: "<p>Login destination</p>" })
class LoginDestination {}

const customer = () =>
  AuthSession.create("Cliente Portal", "cliente@example.test", "CLIENTE", null, 9, 4, "es", [])
const staff = () =>
  AuthSession.create("Operador", "operador@example.test", "Administrador", null, 3, 2, "es", [])

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
        ...PORTAL_ROUTES,
        { path: "admin", component: AdminDestination },
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

describe("portal routes", () => {
  it("composes one lazy guarded portal experience with a single real section", () => {
    expect(PORTAL_ROUTES).toHaveLength(1)
    const portal = PORTAL_ROUTES[0]
    expect(portal.path).toBe("portal")
    expect(portal.canActivate).toEqual([portalGuard])
    expect(portal.loadComponent).toBeTypeOf("function")
    const children = portal.children!
    // No dead entries: `/portal` opens the only implemented section, whose static path is
    // declared ahead of its own view-more-specific `:id` child.
    expect(children.map(route => route.path)).toEqual(["", "requests", "requests/:id"])
    expect(children[0].pathMatch).toBe("full")
    expect(children[0].redirectTo).toBe("requests")
    expect(children[1].loadComponent).toBeTypeOf("function")
    expect(children[1].canActivate).toBeUndefined()
    // The own-request detail inherits the shell's audience guard and adds no local provider.
    expect(children[2].loadComponent).toBeTypeOf("function")
    expect(children[2].canActivate).toBeUndefined()
    expect(children[2].providers).toBeUndefined()
  })

  it("protects the portal for anonymous visitors without any read or shell", async () => {
    const auth = setup(null)
    const harness = await RouterTestingHarness.create("/portal/requests?offset=20")
    expect(auth.restoreSession).toHaveBeenCalled()
    expect(TestBed.inject(Router).url).toBe("/login?returnUrl=%2Fportal%2Frequests%3Foffset%3D20")
    expect(harness.routeNativeElement?.querySelector("app-portal-shell")).toBeNull()
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })

  it("sends a staff session out of the portal before any read or shell", async () => {
    setup(staff())
    const harness = await RouterTestingHarness.create("/portal/requests")
    await harness.fixture.whenStable()
    expect(TestBed.inject(Router).url).toBe("/admin")
    expect(harness.routeNativeElement?.textContent).toContain("Admin destination")
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })

  it("opens Mis solicitudes for a customer with its own shell and no admin affordance", async () => {
    const auth = setup(customer())
    const harness = await RouterTestingHarness.create("/portal")
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(TestBed.inject(Router).url).toBe("/portal/requests")
    const element = harness.routeNativeElement!
    expect(element.tagName.toLowerCase()).toBe("app-portal-shell")

    // Brand and session identity without any admin-only chrome.
    expect(element.querySelector(".brand-mark")?.textContent?.trim()).toBe("RM")
    expect(element.querySelector(".session-controls")?.textContent).toContain("Cliente Portal")
    expect(element.querySelector("app-admin-sidebar")).toBeNull()
    expect(element.querySelector(".catalog-metrics")).toBeNull()
    expect(element.querySelector(".status-header")).toBeNull()

    // One real section, and it is the current one.
    const nav = element.querySelector('nav[aria-label="Navegación del portal"]')!
    expect(nav).not.toBeNull()
    const links = Array.from(nav.querySelectorAll("a"))
    expect(links).toHaveLength(1)
    expect(links[0].textContent?.trim()).toBe("Mis solicitudes")
    expect(links[0].getAttribute("href")).toBe("/portal/requests")
    expect(links[0].getAttribute("aria-current")).toBe("page")
    expect(element.querySelector("app-portal-requests-page")).not.toBeNull()

    // Nothing administrative is reachable from the customer shell.
    expect(element.querySelectorAll('a[href^="/admin"]')).toHaveLength(0)
    expect(element.textContent).not.toMatch(/Salir de la administración|Entorno:/)
    const shellButtons = Array.from(element.querySelectorAll("header button")).map(button =>
      button.textContent?.trim()
    )
    expect(shellButtons).toEqual(["Salir"])
    const pageButtons = Array.from(
      element.querySelectorAll<HTMLButtonElement>("app-catalog-frame button")
    )
    expect(pageButtons.filter(button => !button.disabled)).toHaveLength(0)

    const request = TestBed.inject(HttpTestingController).expectOne(
      candidate =>
        candidate.url === "http://localhost:8080/api/solicitudes" &&
        candidate.params.get("pagina") === "0" &&
        candidate.params.get("tamanio") === "20"
    )
    expect(request.request.params.has("idCliente")).toBe(false)
    request.flush(emptyPage)
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(element.textContent).toContain("Aún no tienes solicitudes")
    TestBed.inject(HttpTestingController).expectNone(() => true)
    expect(auth.session()?.role).toBe("CLIENTE")
  })

  it("logs the customer out from its own shell", async () => {
    const auth = setup(customer())
    const harness = await RouterTestingHarness.create("/portal/requests")
    await harness.fixture.whenStable()
    TestBed.inject(HttpTestingController)
      .expectOne(candidate => candidate.url === "http://localhost:8080/api/solicitudes")
      .flush(emptyPage)
    await harness.fixture.whenStable()
    harness.detectChanges()
    const button = Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>("button")
    ).find(item => item.textContent?.includes("Salir"))!
    button.click()
    await harness.fixture.whenStable()
    expect(auth.logout).toHaveBeenCalledOnce()
    expect(TestBed.inject(Router).url).toBe("/login")
  })
})
