import { Component, createEnvironmentInjector, EnvironmentInjector } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { By } from "@angular/platform-browser"
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
import { ServiceOrdersPage } from "./presentation/pages/service-orders-page/service-orders-page"
import { ServiceOrderDetailPage } from "./presentation/pages/service-order-detail-page/service-order-detail-page"
import { ordersDtoPage } from "./presentation/pages/service-orders-page/service-orders-page.testing"
import { orderDetailDto } from "./presentation/pages/service-order-detail-page/service-order-detail-page.testing"
import { ServiceOrdersStore } from "./presentation/state/service-orders.store"
import { OPERATIONS_REPOSITORY } from "./domain/repositories/operations.repository"
import { OperationsRepositoryImpl } from "./infrastructure/repositories/operations.repository-impl"
import { AgendaPage } from "./presentation/pages/agenda-page/agenda-page"
import { AgendaStore } from "./presentation/state/agenda.store"
import { agendaDto } from "./presentation/state/agenda.testing"

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
  // T6F / S1,S3,S4,S5,S6,S8: additive integration, not independent leaf acceptance.
  it("adds order consumers while preserving the requests default and existing destinations", () => {
    expect(OPERATIONS_ROUTES.map(route => route.path)).toEqual([
      "",
      "requests",
      "requests/:id",
      "orders",
      "orders/:id",
      "agenda"
    ])
    expect(OPERATIONS_ROUTES[0]).toMatchObject({ pathMatch: "full", redirectTo: "requests" })
  })

  it.each([
    ["requests", ServiceRequestsPage],
    ["requests/:id", ServiceRequestDetailPage],
    ["orders", ServiceOrdersPage],
    ["orders/:id", ServiceOrderDetailPage],
    ["agenda", AgendaPage]
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

  it("owns complete distinct route toast scopes and inherits root request/order/auth/repository lifetimes", () => {
    const routes = OPERATIONS_ROUTES.filter(route => route.loadComponent)
    expect(routes).toHaveLength(5)
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const root = TestBed.inject(EnvironmentInjector)
    const reference = createEnvironmentInjector(provideCatalogToast(), root)
    const scopes = routes.map(route => createEnvironmentInjector(route.providers ?? [], root))
    try {
      const store = root.get(ServiceRequestsStore),
        orders = root.get(ServiceOrdersStore),
        repository = root.get(OperationsRepositoryImpl),
        auth = root.get(AuthStore)
      expect(root.get(OPERATIONS_REPOSITORY)).toBe(repository)
      const toasts = scopes.map(scope => scope.get(HotToastService, null, { self: true }))
      const views = scopes.map(scope => scope.get(ViewService, null, { self: true }))
      scopes.forEach((scope, index) => {
        expect(toasts[index]).not.toBeNull()
        expect(views[index]).not.toBeNull()
        expect(toasts[index]!.defaultConfig).toEqual(reference.get(HotToastService).defaultConfig)
        expect(scope.get(ServiceRequestsStore, null, { self: true })).toBeNull()
        expect(scope.get(AuthStore, null, { self: true })).toBeNull()
        expect(scope.get(ServiceOrdersStore, null, { self: true })).toBeNull()
        expect(scope.get(OPERATIONS_REPOSITORY, null, { self: true })).toBeNull()
        expect(scope.get(OperationsRepositoryImpl, null, { self: true })).toBeNull()
        expect(scope.get(ServiceOrdersStore)).toBe(orders)
        expect(scope.get(OPERATIONS_REPOSITORY)).toBe(repository)
        expect(scope.get(ServiceRequestsStore)).toBe(store)
        expect(scope.get(AuthStore)).toBe(auth)
      })
      expect(new Set(toasts).size).toBe(5)
      expect(new Set(views).size).toBe(5)
    } finally {
      scopes.forEach(scope => scope.destroy())
      reference.destroy()
    }
  })

  it.each([
    "/admin/operations",
    "/admin/operations/requests",
    "/admin/operations/requests/17?page=2&size=5",
    "/admin/operations/orders",
    "/admin/operations/orders/17?page=2&size=5",
    "/admin/operations/agenda"
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

  it.each([
    ["/admin/operations/orders?page=2&size=5", "app-service-orders-page", false],
    ["/admin/operations/orders/17?page=2&size=5", "app-service-order-detail-page", true]
  ] as const)(
    "opens authenticated %s through the real root HTTP/Bearer composition",
    async (url, selector, detail) => {
      const app = await setup(true)
      const harness = await RouterTestingHarness.create(url)
      const endpoint = `http://localhost:8080/api/ordenes${detail ? "/17" : ""}`
      const pending = app.http.expectOne(request => request.url === endpoint)
      expect(pending.request.method).toBe("GET")
      expect(pending.request.headers.get("Authorization")).toBe("Bearer fake-access")
      expect(pending.request.transferCache).toBe(false)
      if (detail) {
        expect(pending.request.params.keys()).toEqual([])
        pending.flush(orderDetailDto())
      } else {
        expect(pending.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
        expect(pending.request.params.get("pagina")).toBe("2")
        expect(pending.request.params.get("tamanio")).toBe("5")
        pending.flush(ordersDtoPage(2, 5, 11))
      }
      await harness.fixture.whenStable()
      harness.detectChanges()
      const shell = harness.routeNativeElement!
      expect(shell.tagName.toLowerCase()).toBe("app-admin-shell")
      expect(shell.querySelectorAll("app-admin-sidebar")).toHaveLength(1)
      expect(shell.querySelectorAll(selector)).toHaveLength(1)
      expect(shell.querySelectorAll(`${selector} app-catalog-frame`)).toHaveLength(1)
      expect(shell.textContent).toContain("Cliente suministrado")
      const consumer = harness.fixture.debugElement.query(
        By.directive(detail ? ServiceOrderDetailPage : ServiceOrdersPage)
      )
      expect(consumer, "Rendered order consumer debug element").not.toBeNull()
      expect(consumer.injector.get(ServiceOrdersStore)).toBe(TestBed.inject(ServiceOrdersStore))
      expect(consumer.injector.get(ServiceRequestsStore)).toBe(TestBed.inject(ServiceRequestsStore))
      expect(consumer.injector.get(OPERATIONS_REPOSITORY)).toBe(
        TestBed.inject(OperationsRepositoryImpl)
      )
      expect(consumer.injector.get(AuthStore)).toBe(app.auth)
      const operations = shell.querySelector('a[href="/admin/operations"]')!
      expect(operations.textContent?.trim()).toBe("Operaciones")
      expect(operations.getAttribute("aria-current")).toBe("page")
      for (const [path, label] of [
        ["users", "IAM"],
        ["customers", "CRM"],
        ["staff", "RRHH"]
      ])
        expect(shell.querySelector(`a[href="/admin/${path}"]`)?.textContent?.trim()).toBe(label)
      expect(shell.querySelector('app-admin-sidebar a[href="/admin/operations/orders"]')).toBeNull()
      expect(TestBed.inject(Router).url).toBe(url)
      expect(app.auth.restoreSession).toHaveBeenCalled()
      app.http.verify()
    }
  )

  it("opens protected Agenda blank, then dispatches one explicit root-composed GET and links the actual order", async () => {
    const app = await setup(true)
    const harness = await RouterTestingHarness.create("/admin/operations/agenda")
    const settle = async () => {
      await harness.fixture.whenStable()
      harness.detectChanges()
    }
    await settle()
    const consumer = harness.fixture.debugElement.query(By.directive(AgendaPage))
    expect(consumer).not.toBeNull()
    expect(consumer.injector.get(AgendaStore)).toBeDefined()
    expect(TestBed.inject(AgendaStore, null)).toBeNull()
    expect(consumer.injector.get(OPERATIONS_REPOSITORY)).toBe(
      TestBed.inject(OperationsRepositoryImpl)
    )
    expect(consumer.injector.get(AuthStore)).toBe(app.auth)
    expect(consumer.injector.get(HotToastService)).toBeDefined()
    app.http.expectNone(r => r.url.includes("/api/"))
    const shell = harness.routeNativeElement!
    expect(shell.querySelector('app-admin-sidebar a[href="/admin/operations/agenda"]')).toBeNull()
    expect(shell.querySelector('a[href="/admin/operations"]')?.getAttribute("aria-current")).toBe(
      "page"
    )
    const date = shell.querySelector<HTMLInputElement>("#agenda-date")!
    expect(date.value).toBe("")
    date.value = "2024-02-29"
    date.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
    shell.querySelector<HTMLButtonElement>('app-agenda-page button[type="submit"]')!.click()
    await settle()
    const pending = app.http.expectOne(r => r.url === "http://localhost:8080/api/agenda")
    expect(pending.request.method).toBe("GET")
    expect(pending.request.headers.get("Authorization")).toBe("Bearer fake-access")
    expect(pending.request.transferCache).toBe(false)
    expect(pending.request.params.keys().sort()).toEqual(["desde", "hasta"])
    expect(pending.request.params.get("desde")).toBe("2024-02-29")
    expect(pending.request.params.get("hasta")).toBe("2024-02-29")
    pending.flush([agendaDto()])
    await settle()
    expect(
      shell.querySelector('app-agenda-page a[href="/admin/operations/orders/17"]')
    ).not.toBeNull()
    app.http.verify()
  })

  it("navigates requests → orders → loaded detail → effective inbox → requests without duplicate reads", async () => {
    const app = await setup(true)
    const harness = await RouterTestingHarness.create("/admin/operations")
    app.http
      .expectOne(request => request.url === api)
      .flush({
        contenido: [],
        pagina: 0,
        tamanio: 20,
        totalElementos: 0,
        totalPaginas: 0
      })
    const settle = async () => {
      await harness.fixture.whenStable()
      harness.detectChanges()
    }
    await settle()
    const ordersLink = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
      'app-service-requests-page [catalogControls] a[href="/admin/operations/orders"]'
    )
    expect(ordersLink, "Missing working Órdenes inbox link").not.toBeNull()
    ordersLink!.click()
    await settle()
    const ordersApi = "http://localhost:8080/api/ordenes"
    const list = app.http.expectOne(request => request.url === ordersApi)
    expect(list.request.headers.get("Authorization")).toBe("Bearer fake-access")
    list.flush(ordersDtoPage(0, 5, 1))
    await settle()
    const detailLink = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
      "app-service-orders-page [catalogDesktop] a"
    )!
    expect(detailLink.getAttribute("href")).toBe("/admin/operations/orders/17?page=0&size=5")
    detailLink.click()
    await settle()
    const detail = app.http.expectOne(`${ordersApi}/17`)
    expect(detail.request.headers.get("Authorization")).toBe("Bearer fake-access")
    detail.flush(orderDetailDto())
    await settle()
    const back = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
      "app-service-order-detail-page [catalogControls] a"
    )!
    expect(back).not.toBeNull()
    expect(back.getAttribute("href")).toBe("/admin/operations/orders?page=0&size=5")
    back.click()
    await settle()
    app.http
      .expectOne(request => request.url === ordersApi && request.params.get("tamanio") === "5")
      .flush(ordersDtoPage(0, 5, 1))
    await settle()
    const requestsLink = harness.routeNativeElement!.querySelector<HTMLAnchorElement>(
      'app-service-orders-page [catalogControls] a[href="/admin/operations/requests"]'
    )!
    expect(requestsLink).not.toBeNull()
    requestsLink.click()
    await settle()
    expect(TestBed.inject(Router).url).toBe("/admin/operations/requests")
    expect(harness.routeNativeElement!.querySelector("app-service-requests-page")).not.toBeNull()
    // The original successful 0/20 requests entry is still fresh in the root store.
    app.http.expectNone(request => request.url.includes("/api/"))
    app.http.verify()
  })
})
