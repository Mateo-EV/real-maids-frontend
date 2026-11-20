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
import { provideCustomerSupportReads } from "@/app/features/customer-support/customer-support.providers"
import { provideOperationsRequestReads } from "@/app/features/operations/operations.providers"
import { portalPendingLeaveGuard } from "./presentation/navigation/portal-support-create-leave.guard"
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
      provideCustomerSupportReads(),
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
  it("composes one lazy guarded portal experience with its real sections", () => {
    expect(PORTAL_ROUTES).toHaveLength(1)
    const portal = PORTAL_ROUTES[0]
    expect(portal.path).toBe("portal")
    expect(portal.canActivate).toEqual([portalGuard])
    expect(portal.loadComponent).toBeTypeOf("function")
    const children = portal.children!
    // No dead entries: `/portal` opens the first implemented section, and every static path is
    // declared ahead of its own view-more-specific `:id` child.
    expect(children.map(route => route.path)).toEqual([
      "",
      "requests",
      "requests/:id",
      "services",
      "services/:id",
      "support",
      "support/new",
      "support/:id"
    ])
    expect(children[0].pathMatch).toBe("full")
    expect(children[0].redirectTo).toBe("requests")
    expect(children[1].loadComponent).toBeTypeOf("function")
    expect(children[1].canActivate).toBeUndefined()
    // The own-request detail inherits the shell's audience guard and adds no local provider.
    expect(children[2].loadComponent).toBeTypeOf("function")
    expect(children[2].canActivate).toBeUndefined()
    expect(children[2].providers).toBeUndefined()
    // The own-orders section mirrors it: static list before its id detail, no local guard.
    expect(children[3].loadComponent).toBeTypeOf("function")
    expect(children[3].canActivate).toBeUndefined()
    expect(children[4].loadComponent).toBeTypeOf("function")
    expect(children[4].canActivate).toBeUndefined()
    expect(children[4].providers).toBeUndefined()
    // Own support mirrors it too: static list before its id detail, no local guard or provider.
    expect(children[5].loadComponent).toBeTypeOf("function")
    expect(children[5].canActivate).toBeUndefined()
    expect(children[5].providers).toBeUndefined()
    // The only portal write is declared between them: `support/new` before `support/:id`, so the
    // static path is never taken for an id. It owns the pending-write leave decision.
    expect(children[6].loadComponent).toBeTypeOf("function")
    expect(children[6].canActivate).toBeUndefined()
    expect(children[6].providers).toBeUndefined()
    expect(children[6].path).toBe("support/new")
    expect(children[6].canDeactivate).toEqual([portalPendingLeaveGuard])
    expect(children[7].loadComponent).toBeTypeOf("function")
    expect(children[7].canActivate).toBeUndefined()
    expect(children[7].canDeactivate).toBeUndefined()
    expect(children[7].providers).toBeUndefined()
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

    // Three real sections; the current one is marked, the others are working destinations.
    const nav = element.querySelector('nav[aria-label="Navegación del portal"]')!
    expect(nav).not.toBeNull()
    const links = Array.from(nav.querySelectorAll("a"))
    expect(links).toHaveLength(3)
    expect(links[0].textContent?.trim()).toBe("Mis solicitudes")
    expect(links[0].getAttribute("href")).toBe("/portal/requests")
    expect(links[0].getAttribute("aria-current")).toBe("page")
    expect(links[1].textContent?.trim()).toBe("Mis servicios")
    expect(links[1].getAttribute("href")).toBe("/portal/services")
    expect(links[1].getAttribute("aria-current")).toBeNull()
    // «Soporte» exists because its consumer exists: own attentions are implemented by T5.
    expect(links[2].textContent?.trim()).toBe("Soporte")
    expect(links[2].getAttribute("href")).toBe("/portal/support")
    expect(links[2].getAttribute("aria-current")).toBeNull()
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

  it("opens Soporte for a customer with its own caller-scoped read and no admin affordance", async () => {
    setup(customer())
    const harness = await RouterTestingHarness.create("/portal/support")
    await harness.fixture.whenStable()
    harness.detectChanges()
    const element = harness.routeNativeElement!
    expect(TestBed.inject(Router).url).toBe("/portal/support")
    expect(element.querySelector("app-portal-support-page")).not.toBeNull()
    expect(element.querySelectorAll('a[href^="/admin"]')).toHaveLength(0)
    const active = element.querySelector('nav[aria-label="Navegación del portal"] a[aria-current]')
    expect(active?.textContent?.trim()).toBe("Soporte")

    const request = TestBed.inject(HttpTestingController).expectOne(
      candidate =>
        candidate.url === "http://localhost:8080/api/atenciones" &&
        candidate.params.get("pagina") === "0" &&
        candidate.params.get("tamanio") === "20"
    )
    // The backend scopes the list to the caller: no customer id travels.
    expect(request.request.params.has("idCliente")).toBe(false)
    request.flush(emptyPage)
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(element.textContent).toContain("Aún no tienes atenciones")
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })

  it("opens the own-attention form at the static support/new path, not as an id", async () => {
    setup(customer())
    const harness = await RouterTestingHarness.create("/portal/support/new")
    await harness.fixture.whenStable()
    harness.detectChanges()
    const element = harness.routeNativeElement!
    expect(TestBed.inject(Router).url).toBe("/portal/support/new")
    expect(element.querySelector("app-portal-support-create-page")).not.toBeNull()
    expect(element.querySelector("app-portal-support-detail-page")).toBeNull()
    const http = TestBed.inject(HttpTestingController)
    // Two reads open the form: the supplied type catalog and the customer's own services.
    http
      .expectOne(
        candidate => candidate.url === "http://localhost:8080/api/catalogos/tipos-atencion"
      )
      .flush([{ idTipo: 4, nombre: "Consulta", requiereRespuesta: true }])
    const orders = http.expectOne(
      candidate => candidate.url === "http://localhost:8080/api/ordenes"
    )
    expect(orders.request.method).toBe("GET")
    expect(orders.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    expect(orders.request.params.has("idCliente")).toBe(false)
    orders.flush({ contenido: [], pagina: 0, tamanio: 20, totalElementos: 0, totalPaginas: 0 })
    await harness.fixture.whenStable()
    harness.detectChanges()
    // No admin affordance and no customer id in the only write the portal has.
    expect(element.querySelectorAll('a[href^="/admin"]')).toHaveLength(0)
    expect(element.textContent).toContain("Servicio relacionado (opcional)")
    http.expectNone(() => true)
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
