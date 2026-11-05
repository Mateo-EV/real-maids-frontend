import { Component, createEnvironmentInjector, EnvironmentInjector } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ViewService } from "@ngneat/overview"
import { HotToastService } from "@ngxpert/hot-toast"
import { appConfig } from "@/app/core/config/app.config"
import { ADMIN_ROUTES } from "@/app/experiences/admin/admin.routes"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideCatalogToast } from "@/app/shared/notifications/catalog-toast"
import { OPERATIONS_ROUTES } from "./operations.routes"
import { ServiceRequestsPage } from "./presentation/pages/service-requests-page/service-requests-page"
import { ServiceRequestDetailPage } from "./presentation/pages/service-request-detail-page/service-request-detail-page"
import { ServiceRequestsStore } from "./presentation/state/service-requests.store"

@Component({ template: "Login destination" })
class LoginDestination {}

const api = "http://localhost:8080/api/solicitudes"
const dto = {
  idSolicitud: 17,
  idCliente: 5,
  cliente: "Cliente del servidor",
  idPropiedad: 7,
  propiedad: "Propiedad del servidor",
  idTipoServicio: 9,
  tipoServicio: "Limpieza",
  descripcion: null,
  fechaDeseada: null,
  estado: "registrada",
  registradoPor: "Actor del servidor",
  fechaRegistro: "2026-01-01T12:00:00Z",
  fechaActualizacion: null
}

function requireAdminEntry() {
  const route = ADMIN_ROUTES[0].children!.find(route => route.path === "operations")
  expect(route, "Missing approved lazy /admin/operations entry").toBeDefined()
  expect(route!.loadChildren).toBeTypeOf("function")
  return route!
}

async function setup(authenticated: boolean) {
  TestBed.configureTestingModule({
    providers: [...appConfig.providers, provideHttpClientTesting()]
  })
  TestBed.inject(Router).resetConfig([
    ...ADMIN_ROUTES,
    { path: "login", component: LoginDestination }
  ])
  const auth = TestBed.inject(AuthStore),
    http = TestBed.inject(HttpTestingController)
  if (authenticated) {
    const pending = firstValueFrom(
      auth.login({ email: "caller@example.test", password: "FakePassword1" })
    )
    http.expectOne("http://localhost:8080/api/auth/login").flush({
      token: "fake-access",
      tipo: "Bearer",
      expiraEnSegundos: 60,
      refreshToken: "fake-refresh",
      refreshExpiraEnSegundos: 600,
      usuario: {
        idUsuario: 19,
        nombre: "Caller",
        correo: "caller@example.test",
        idRol: 9,
        rol: "Backend role",
        idioma: "es",
        permisos: []
      }
    })
    expect((await pending).success).toBe(true)
  }
  vi.spyOn(auth, "restoreSession")
  return { auth, http }
}

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
})
afterEach(() => vi.unstubAllGlobals())

// Spec: odd/tasks/wp7-operations.md T5/S1-S4; no role ACL or new write consumers.
describe("Operations protected request integration", () => {
  it("defines only a default redirect and the two delivered request consumers", () => {
    expect(OPERATIONS_ROUTES.map(route => route.path)).toEqual(["", "requests", "requests/:id"])
    expect(OPERATIONS_ROUTES[0]).toMatchObject({ pathMatch: "full", redirectTo: "requests" })
  })

  it.each([
    ["requests", ServiceRequestsPage],
    ["requests/:id", ServiceRequestDetailPage]
  ] as const)("lazy loads %s behind the unchanged auth guard", async (path, component) => {
    const route = OPERATIONS_ROUTES.find(route => route.path === path)
    expect(route, `Missing protected request route: ${path}`).toBeDefined()
    expect(route!.canActivate).toEqual([authGuard])
    expect(route!.component).toBeUndefined()
    expect(await route!.loadComponent!()).toBe(component)
  })

  it("adds its lazy group without replacing the protected shell, old groups or users redirect", async () => {
    const route = requireAdminEntry()
    expect(await route.loadChildren!()).toBe(OPERATIONS_ROUTES)
    expect(route.providers).toBeUndefined()
    expect(ADMIN_ROUTES[0].canActivate).toEqual([authGuard])
    const children = ADMIN_ROUTES[0].children!
    expect(children.find(route => route.path === "")).toMatchObject({
      pathMatch: "full",
      redirectTo: "users"
    })
    for (const path of ["users", "customers", "staff"])
      expect(children.find(route => route.path === path)?.loadChildren).toBeTypeOf("function")
  })

  it("owns complete distinct route toast scopes and inherits the one root request/auth stores", () => {
    const routes = OPERATIONS_ROUTES.filter(route => route.loadComponent)
    expect(routes).toHaveLength(2)
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const root = TestBed.inject(EnvironmentInjector)
    const reference = createEnvironmentInjector(provideCatalogToast(), root)
    const scopes = routes.map(route => createEnvironmentInjector(route.providers ?? [], root))
    try {
      const store = root.get(ServiceRequestsStore),
        auth = root.get(AuthStore)
      const toasts = scopes.map(scope => scope.get(HotToastService, null, { self: true }))
      const views = scopes.map(scope => scope.get(ViewService, null, { self: true }))
      scopes.forEach((scope, index) => {
        expect(toasts[index]).not.toBeNull()
        expect(views[index]).not.toBeNull()
        expect(toasts[index]!.defaultConfig).toEqual(reference.get(HotToastService).defaultConfig)
        expect(scope.get(ServiceRequestsStore, null, { self: true })).toBeNull()
        expect(scope.get(AuthStore, null, { self: true })).toBeNull()
        expect(scope.get(ServiceRequestsStore)).toBe(store)
        expect(scope.get(AuthStore)).toBe(auth)
      })
      expect(new Set(toasts).size).toBe(2)
      expect(new Set(views).size).toBe(2)
    } finally {
      scopes.forEach(scope => scope.destroy())
      reference.destroy()
    }
  })

  it.each([
    "/admin/operations",
    "/admin/operations/requests",
    "/admin/operations/requests/17?page=2&size=5"
  ])("restores guest %s and redirects to login without private UI or requests", async url => {
    const app = await setup(false)
    requireAdminEntry()
    const harness = await RouterTestingHarness.create(url)
    expect(app.auth.restoreSession).toHaveBeenCalled()
    const returnUrl = url === "/admin/operations" ? "/admin/operations/requests" : url
    expect(TestBed.inject(Router).url).toBe(`/login?returnUrl=${encodeURIComponent(returnUrl)}`)
    expect(harness.routeNativeElement?.textContent).toContain("Login destination")
    expect(harness.routeNativeElement?.querySelector("app-admin-shell")).toBeNull()
    app.http.expectNone(request => request.url.includes("/api/"))
    app.http.verify()
  })

  it.each([
    ["/admin/operations", "app-service-requests-page", api, 0, 20],
    ["/admin/operations/requests?page=2&size=5", "app-service-requests-page", api, 2, 5],
    [
      "/admin/operations/requests/17?page=2&size=5",
      "app-service-request-detail-page",
      `${api}/17`,
      2,
      5
    ]
  ] as const)(
    "opens %s in the existing shell with Operaciones active and one root-owned GET",
    async (url, selector, endpoint, page, size) => {
      const app = await setup(true)
      requireAdminEntry()
      const harness = await RouterTestingHarness.create(url)
      const request = app.http.expectOne(request => request.url === endpoint)
      expect(request.request.method).toBe("GET")
      expect(request.request.headers.get("Authorization")).toBe("Bearer fake-access")
      expect(request.request.transferCache).toBe(false)
      if (endpoint === api) {
        expect(request.request.params.get("pagina")).toBe(String(page))
        expect(request.request.params.get("tamanio")).toBe(String(size))
        request.flush({
          contenido: [],
          pagina: page,
          tamanio: size,
          totalElementos: 0,
          totalPaginas: 0
        })
      } else request.flush(dto)
      await harness.fixture.whenStable()
      harness.detectChanges()
      const shell = harness.routeNativeElement!
      expect(shell.tagName.toLowerCase()).toBe("app-admin-shell")
      expect(shell.querySelectorAll("app-admin-sidebar")).toHaveLength(1)
      expect(shell.querySelectorAll(selector)).toHaveLength(1)
      expect(shell.querySelectorAll(`${selector} app-catalog-frame`)).toHaveLength(1)
      expect(harness.routeDebugElement!.injector.get(ServiceRequestsStore)).toBe(
        TestBed.inject(ServiceRequestsStore)
      )
      const link = shell.querySelector('a[href="/admin/operations"]')!
      expect(link, "Missing Operaciones sidebar destination").not.toBeNull()
      expect(link.textContent?.trim()).toBe("Operaciones")
      expect(link.getAttribute("aria-current")).toBe("page")
      expect(shell.querySelector('a[href="/admin/customers"]')?.textContent?.trim()).toBe("CRM")
      expect(shell.querySelector('a[href="/admin/staff"]')?.textContent?.trim()).toBe("RRHH")
      expect(shell.querySelector('a[href="/admin/users"]')?.textContent?.trim()).toBe("IAM")
      expect(app.auth.restoreSession).toHaveBeenCalled()
      expect(TestBed.inject(Router).url).toBe(
        url === "/admin/operations" ? "/admin/operations/requests" : url
      )
      app.http.verify()
    }
  )
})
