import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import {
  Component,
  createEnvironmentInjector,
  EnvironmentInjector,
  PLATFORM_ID,
  signal
} from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { ViewService } from "@ngneat/overview"
import { HotToastService } from "@ngxpert/hot-toast"
import { BehaviorSubject, of } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
import { provideCatalogToast } from "@/app/shared/notifications/catalog-toast"
import { CUSTOMER_SUPPORT_ROUTES } from "../../customer-support.routes"
import { provideCustomerSupportReads } from "../../customer-support.providers"
import { SupportRequestsStore } from "../state/support-requests.store"
import { SupportRequestDetailPage } from "./support-request-detail-page/support-request-detail-page"
import { SupportRequestsPage } from "./support-requests-page/support-requests-page"

@Component({ template: "Login destination" })
class LoginDestination {}

const api = "https://api.example.test/api/atenciones"
const typesApi = "https://api.example.test/api/catalogos/tipos-atencion"
const inbox = "/admin/support"
const deadline = 4102444800000
const caller = (id = 19, expires = deadline, name = "Caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, expires, id)

const requestDto = (id = 17, subject = "Consulta de facturación") => ({
  idAtencion: id,
  idCliente: 8,
  cliente: "Cliente autorizado",
  idOrden: null,
  codigoOrden: null,
  idTipo: 4,
  tipo: "Consulta",
  requiereRespuesta: true,
  estado: "RECIBIDA",
  estadoNombre: "Recibida",
  asunto: subject,
  descripcion: "Descripción literal",
  fechaRegistro: "2026-03-02T04:30:00Z",
  fechaCierre: null
})

const page = (pagina = 0, tamanio = 20, total = 45) => ({
  contenido: Array.from(
    { length: Math.min(tamanio, Math.max(0, total - pagina * tamanio)) },
    (_, index) => requestDto(1000 + index, `Asunto ${1000 + index}`)
  ),
  pagina,
  tamanio,
  totalElementos: total,
  totalPaginas: Math.ceil(total / tamanio)
})

const detail = (id = 17) => ({
  atencion: requestDto(id, "Asunto de la atención"),
  seguimiento: [
    {
      idSeguimiento: 90,
      autor: "Agente de soporte",
      delCliente: false,
      mensaje: "Revisando",
      fecha: "2026-03-03T09:00:00Z"
    }
  ]
})

const types = [{ idTipo: 4, nombre: "Consulta", requiereRespuesta: true }]

/** The inbox owns the customer picker; its paged read is stubbed here. */
const customerItems = signal<{ id: number; name: string; isActive: boolean }[]>([
  { id: 8, name: "Cliente autorizado", isActive: true }
])
const customersStub = {
  selectQuery: () => ({
    result: { items: customerItems(), offset: 0, limit: 20, total: customerItems().length },
    loading: false,
    refreshing: false,
    error: undefined
  }),
  observeQuery: () => new BehaviorSubject(undefined).asObservable()
}

async function mount(url = `${inbox}?offset=20&limit=20`) {
  const session = new BehaviorSubject<AuthSession | null>(caller())
  TestBed.configureTestingModule({
    providers: [
      // Real route definitions (guard, toast scope, lazy components) under test-only paths.
      provideRouter([
        { ...CUSTOMER_SUPPORT_ROUTES[0], path: "admin/support" },
        { ...CUSTOMER_SUPPORT_ROUTES[1], path: "admin/support/:id" }
      ]),
      provideCustomerSupportReads(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CustomersStore, useValue: customersStub },
      { provide: API_URL, useValue: "https://api.example.test" },
      { provide: PLATFORM_ID, useValue: "browser" },
      {
        provide: AuthStore,
        useValue: { session: () => session.value, restoreSession: () => of(session.value) }
      },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } }
    ]
  })
  const http = TestBed.inject(HttpTestingController)
  const router = TestBed.inject(Router)
  const harness = await RouterTestingHarness.create(url)
  /** The inbox page read; the KPI block owns its own `tamanio=1` totals on the same URL. */
  const list = () => {
    const request = http.expectOne(
      candidate => candidate.url === api && candidate.params.get("tamanio") !== "1"
    )
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    return request
  }
  /** The summary above the page reads four module totals; they are not this spec's subject. */
  const flushMetrics = () =>
    http
      .match(request => request.url === api && request.params.get("tamanio") === "1")
      .forEach((pending, index) => pending.flush(page(0, 1, [3, 1, 7, 11][index] ?? 0)))
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
    flushMetrics()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement!
  const flushCatalog = async () => {
    http.expectOne(typesApi).flush(types)
    await settle()
  }
  return { http, router, harness, settle, element, list, flushCatalog }
}

afterEach(() => {
  // Each HTTP test verifies its own controller; tests without HTTP testing never inject it.
  vi.restoreAllMocks()
})

// WP8 T5 / S11: route wiring and row/return navigation. Live backend, guard behaviour against a
// real server and browser/accessibility acceptance are out of scope here.
describe("Customer support detail route", () => {
  const [inboxRoute, detailRoute] = CUSTOMER_SUPPORT_ROUTES

  it("adds one guarded lazy detail route without disturbing the existing empty-path route", async () => {
    expect(CUSTOMER_SUPPORT_ROUTES).toHaveLength(2)
    expect(inboxRoute.path).toBe("")
    expect(inboxRoute.title).toBe("Soporte | The Real Maids")
    expect(inboxRoute.canActivate).toEqual([authGuard])
    expect(inboxRoute.providers).toEqual(expect.any(Array))
    expect(inboxRoute.children).toBeUndefined()
    expect(inboxRoute.component).toBeUndefined()
    expect(await inboxRoute.loadComponent!()).toBe(SupportRequestsPage)

    expect(detailRoute.path).toBe(":id")
    expect(detailRoute.title).toBe("Detalle de atención | The Real Maids")
    expect(detailRoute.canActivate).toEqual([authGuard])
    expect(detailRoute.providers).toEqual(expect.any(Array))
    expect(detailRoute.children).toBeUndefined()
    expect(detailRoute.component).toBeUndefined()
    expect(await detailRoute.loadComponent!()).toBe(SupportRequestDetailPage)
  })

  it("owns its own complete toast scope without re-providing root stores or auth", () => {
    TestBed.configureTestingModule({ providers: [] })
    const root = TestBed.inject(EnvironmentInjector)
    const reference = createEnvironmentInjector(provideCatalogToast(), root)
    const scope = createEnvironmentInjector(detailRoute.providers ?? [], root)
    try {
      const toast = scope.get(HotToastService, null, { self: true })
      const view = scope.get(ViewService, null, { self: true })
      expect(toast).not.toBeNull()
      expect(view).not.toBeNull()
      expect(toast!.defaultConfig).toEqual(reference.get(HotToastService).defaultConfig)
      for (const token of [SupportRequestsStore, AuthStore])
        expect(scope.get(token, null, { self: true })).toBeNull()
    } finally {
      scope.destroy()
      reference.destroy()
    }
  })

  it("protects the guest deep link with the existing returnUrl contract", async () => {
    const auth = { session: () => null, restoreSession: vi.fn(() => of(null)), logout: vi.fn() }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: "support", children: CUSTOMER_SUPPORT_ROUTES },
          { path: "login", component: LoginDestination }
        ]),
        { provide: AuthStore, useValue: auth }
      ]
    })
    const harness = await RouterTestingHarness.create("/support/123")
    expect(auth.restoreSession).toHaveBeenCalled()
    expect(TestBed.inject(Router).url).toBe("/login?returnUrl=%2Fsupport%2F123")
    expect(harness.routeNativeElement?.textContent).toContain("Login destination")
    expect(harness.routeNativeElement?.querySelector("app-support-request-detail-page")).toBeNull()
  })
})

describe("Customer support inbox to detail navigation", () => {
  it("links each row with only its paging context and returns to the effective page", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    // The URL context is adopted, so the return link genuinely restores this page.
    const app = await mount(`${inbox}?offset=20&limit=20`)
    const first = app.list()
    expect([
      first.request.params.get("pagina"),
      first.request.params.get("tamanio"),
      first.request.params.keys().sort()
    ]).toEqual(["1", "20", ["pagina", "tamanio"]])
    first.flush(page(1, 20, 45))
    await app.settle()
    await app.flushCatalog()
    expect(app.element().textContent).toContain("21–40 de 45")

    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const links = Array.from(
        app.element().querySelectorAll<HTMLAnchorElement>(`${selector} a[href]`)
      )
      expect(links, selector).toHaveLength(20)
      const href = links[0].getAttribute("href")!
      const url = new URL(href, "https://app.example.test")
      expect(url.pathname).toBe("/admin/support/1000")
      // Only the paging the inbox owns travels; in-memory filters never do.
      expect(Array.from(url.searchParams.keys()).sort()).toEqual(["limit", "offset"])
      expect([url.searchParams.get("offset"), url.searchParams.get("limit")]).toEqual(["20", "20"])
    }

    app.element().querySelector<HTMLAnchorElement>("[catalogDesktop] a")!.click()
    await app.settle()
    expect(app.router.url).toBe("/admin/support/1000?offset=20&limit=20")
    app.http.expectOne(`${api}/1000`).flush(detail(1000))
    await app.settle()
    expect(app.element().querySelector("#support-detail-subject")?.textContent).toContain(
      "Asunto de la atención"
    )

    const back = Array.from(app.element().querySelectorAll<HTMLAnchorElement>("a[href]")).find(
      link => new URL(link.href, "https://app.example.test").pathname === "/admin/support"
    )!
    expect(back.getAttribute("href")).toBe("/admin/support?offset=20&limit=20")
    expect(back.textContent).toMatch(/volver/i)

    clock.mockReturnValue(31001)
    back.click()
    await app.settle()
    expect(app.router.url).toBe("/admin/support?offset=20&limit=20")
    const restored = app.list()
    expect([restored.request.params.get("pagina"), restored.request.params.get("tamanio")]).toEqual(
      ["1", "20"]
    )
    restored.flush(page(1, 20, 45))
    await app.settle()
    await app.flushCatalog()
    expect(app.element().textContent).toContain("21–40 de 45")
    app.http.verify()
  })
})
