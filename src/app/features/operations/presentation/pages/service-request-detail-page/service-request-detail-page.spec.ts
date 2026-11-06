import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { HotToastService } from "@ngxpert/hot-toast"
import { BehaviorSubject, Subscription } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideOperationsRequestReads } from "../../../operations.providers"
import { ServiceRequestsStore } from "../../state/service-requests.store"
import { ServiceRequestDetailPage } from "./service-request-detail-page"

// Destination only: no peer inbox import or production route/provider changes.
@Component({ template: "<p>Bandeja de solicitudes</p>" })
class RequestInboxDestination {}

const api = "https://api.example.test/api/solicitudes"
const deadline = 4102444800000
const identity = (id = 19, expires = deadline, name = "Session caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, expires, id)
const dto = (id = 17) => ({
  idSolicitud: id,
  idCliente: 8,
  cliente: "Cliente autorizado",
  idPropiedad: 31,
  propiedad: "Oficina norte",
  idTipoServicio: 4,
  tipoServicio: "Limpieza profunda",
  descripcion: "Descripción registrada" as string | null,
  fechaDeseada: "2026-03-08" as string | null,
  estado: "registrada",
  registradoPor: "Operadora registrada",
  fechaRegistro: "2026-03-01T23:30:00-05:00",
  fechaActualizacion: "2026-03-02T01:45:00-05:00" as string | null
})
const subscriptions: Subscription[] = []

async function setup(
  url = "/admin/operations/requests/17",
  options: { server?: boolean; guest?: boolean } = {}
) {
  const session = new BehaviorSubject<AuthSession | null>(options.guest ? null : identity())
  const observeSession = vi.fn(() => session.asObservable())
  const authFactory = vi.fn(() => ({ session: () => session.value }))
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: "admin/operations/requests", component: RequestInboxDestination },
        { path: "admin/operations/requests/:id", component: ServiceRequestDetailPage }
      ]),
      provideOperationsRequestReads(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      { provide: API_URL, useValue: "https://api.example.test" },
      { provide: HotToastService, useValue: { success: vi.fn() } },
      { provide: AuthStore, useFactory: authFactory },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: observeSession } }
    ]
  })
  const http = TestBed.inject(HttpTestingController)
  // Keep the real store/use cases/repository/source. Only public session ports are mocked.
  const store = TestBed.inject(ServiceRequestsStore)
  const router = TestBed.inject(Router)
  const harness = await RouterTestingHarness.create(url)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement!
  const text = () => element().textContent ?? ""
  const pending = (id = 17) => {
    const request = http.expectOne(`${api}/${id}`)
    expect(request.request.method).toBe("GET")
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.transferCache).toBe(false)
    return request
  }
  const navigate = async (target: string) => {
    await router.navigateByUrl(target)
    await settle()
  }
  const retry = async () => {
    const button = Array.from(element().querySelectorAll<HTMLButtonElement>("button")).find(item =>
      /reintentar/i.test(item.textContent ?? "")
    )
    expect(button, "Visible explicit retry action").toBeDefined()
    expect(button!.disabled).toBe(false)
    button!.click()
    await settle()
  }
  const back = () => {
    const link = Array.from(element().querySelectorAll<HTMLAnchorElement>("a[href]")).find(
      item => new URL(item.href).pathname === "/admin/operations/requests"
    )
    expect(link, "Explicit request inbox return link").toBeDefined()
    expect(link!.textContent).toMatch(/volver/i)
    return link!
  }
  return {
    http,
    store,
    router,
    harness,
    session,
    observeSession,
    authFactory,
    settle,
    element,
    text,
    pending,
    navigate,
    retry,
    back
  }
}

afterEach(() => {
  try {
    subscriptions.splice(0).forEach(subscription => subscription.unsubscribe())
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
    vi.useRealTimers()
  }
})

// T5 S1/S3: bounded request reads; S4: explicit future Operaciones URL context.
// The local route deliberately does not certify root integration or guard wiring.
describe("WP7 T5 S1-S4 read-only request detail consumer", () => {
  it("reads one matching request and renders all supplied context without lookups or unrelated write controls", async () => {
    const app = await setup()
    expect(app.text()).toMatch(/cargando solicitud/i)
    expect(app.text()).not.toContain("No registrado")
    app.pending().flush(dto())
    await app.settle()
    expect(app.element().querySelector("app-catalog-frame")).not.toBeNull()
    for (const value of [
      "17",
      "8",
      "Cliente autorizado",
      "31",
      "Oficina norte",
      "4",
      "Limpieza profunda",
      "Descripción registrada",
      "2026-03-08",
      "Operadora registrada",
      "2026-03-02T04:30:00.000Z",
      "2026-03-02T06:45:00.000Z",
      "UTC"
    ])
      expect(app.text()).toContain(value)
    expect(app.text()).toMatch(/registrada/i)
    expect(app.text()).not.toContain("Session caller")
    expect(app.element().querySelector("form, input, select, textarea")).toBeNull()
    expect(app.text()).toContain("Cancelar solicitud")
    expect(app.text()).not.toMatch(/crear orden|cotizar/i)
    expect(app.element().querySelector('a[href*="/customers"], a[href*="/orders"]')).toBeNull()
    app.http.expectNone(() => true)
  })

  it("preserves calendar text and nullable absence while escaping names and description as plain text", async () => {
    const app = await setup()
    app.pending().flush({
      ...dto(),
      cliente: "<b>Cliente literal</b>",
      propiedad: "<b>Propiedad literal</b>",
      tipoServicio: "<b>Servicio literal</b>",
      registradoPor: "<b>Operadora literal</b>",
      descripcion: "<b>Texto literal</b>\nhttps://example.test",
      fechaActualizacion: null
    })
    await app.settle()
    for (const value of [
      "<b>Cliente literal</b>",
      "<b>Propiedad literal</b>",
      "<b>Servicio literal</b>",
      "<b>Operadora literal</b>",
      "<b>Texto literal</b>",
      "https://example.test",
      "2026-03-08",
      "No registrado",
      "2026-03-02T04:30:00.000Z",
      "UTC"
    ])
      expect(app.text()).toContain(value)
    expect(app.element().querySelector('b, a[href="https://example.test"]')).toBeNull()
    await app.navigate("/admin/operations/requests/18")
    app
      .pending(18)
      .flush({ ...dto(18), descripcion: null, fechaDeseada: null, fechaActualizacion: null })
    await app.settle()
    expect(app.text().match(/No registrado/g)?.length).toBeGreaterThanOrEqual(3)
    expect(app.text()).not.toContain("2026-03-08")
    expect(app.text()).not.toContain("Texto literal")
    app.http.expectNone(() => true)
  })

  it("shows a safe invalid-ID state without dispatching request reads", async () => {
    const app = await setup("/admin/operations/requests/0")
    for (const id of ["0", "-1", "1.5", "1e2", "+17", "17x", "2147483648"]) {
      await app.navigate(`/admin/operations/requests/${encodeURIComponent(id)}`)
      expect(app.text()).toMatch(/identificador de solicitud inv[aá]lido/i)
      expect(app.text()).not.toContain("Cliente autorizado")
      app.http.expectNone(() => true)
    }
    // Decimal int32 upper boundary is valid, not rejected by an arbitrary UI cap.
    await app.navigate("/admin/operations/requests/2147483647")
    app.pending(2147483647).flush(dto(2147483647))
    await app.settle()
    expect(app.text()).toContain("2147483647")
    app.http.expectNone(() => true)
  })

  it("offers safe retry for 404, malformed DTO and wrong returned identity without phantom records", async () => {
    const app = await setup()
    for (const failure of ["not-found", "malformed", "wrong-identity"] as const) {
      const request = app.pending()
      if (failure === "not-found") {
        request.flush(
          { mensaje: "Private backend failure" },
          { status: 404, statusText: "Not Found" }
        )
      } else {
        request.flush(failure === "malformed" ? { ...dto(), cliente: null } : dto(18))
      }
      await app.settle()
      expect(app.text()).toMatch(
        failure === "not-found" ? /no se encontr[oó]/i : /respuesta.*no es v[aá]lida/i
      )
      expect(app.text()).not.toContain("Private backend failure")
      expect(app.text()).not.toContain("Cliente autorizado")
      expect(app.text()).not.toContain("No registrado")
      app.http.expectNone(() => true)
      await app.retry()
    }
    app.pending().flush(dto())
    await app.settle()
    expect(app.text()).toContain("Cliente autorizado")
    app.http.expectNone(() => true)
  })

  it("retains same-ID verified stale data on expiry and failure and forces explicit retry GET", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    const app = await setup()
    app.pending().flush(dto())
    await app.settle()
    await app.navigate("/admin/operations/requests")
    now.mockReturnValue(31001)
    await app.navigate("/admin/operations/requests/17")
    const refresh = app.pending()
    expect(app.text()).toContain("Cliente autorizado")
    expect(app.text()).toMatch(/actualizando solicitud/i)
    refresh.flush({ mensaje: "Private denial" }, { status: 403, statusText: "Forbidden" })
    await app.settle()
    expect(app.text()).toContain("Cliente autorizado")
    expect(app.text()).toMatch(/desactualizados/i)
    expect(app.text()).toMatch(/no tienes permiso/i)
    expect(app.text()).not.toContain("Private denial")
    await app.retry()
    expect(app.text()).toContain("Cliente autorizado")
    app.pending().flush({ ...dto(), cliente: "Cliente actualizado" })
    await app.settle()
    expect(app.text()).toContain("Cliente actualizado")
    expect(app.text()).not.toMatch(/desactualizados/i)
    app.http.expectNone(() => true)
  })

  it("cancels replaced route reads and hides other-ID verified records during loading and failure", async () => {
    const app = await setup()
    const old = app.pending()
    await app.navigate("/admin/operations/requests/18")
    expect(old.cancelled).toBe(true)
    expect(app.text()).not.toContain("Cliente autorizado")
    expect(() => old.flush(dto())).toThrow()
    app.pending(18).flush({ ...dto(18), cliente: "Cliente dieciocho" })
    await app.settle()
    expect(app.text()).toContain("Cliente dieciocho")
    await app.navigate("/admin/operations/requests/19")
    expect(app.text()).not.toContain("Cliente dieciocho")
    app.pending(19).flush({}, { status: 403, statusText: "Forbidden" })
    await app.settle()
    expect(app.text()).toMatch(/no tienes permiso/i)
    expect(app.text()).not.toContain("Cliente dieciocho")
    expect(app.text()).not.toContain("No registrado")
    app.http.expectNone(() => true)
  })

  it("updates query-only return context without restarting pending or verified same-ID reads", async () => {
    const app = await setup("/admin/operations/requests/17?page=2&size=5")
    const pending = app.pending()
    await app.navigate("/admin/operations/requests/17?page=3&size=10")
    expect(pending.cancelled).toBe(false)
    app.http.expectNone(() => true)
    pending.flush(dto())
    await app.settle()
    expect(app.text()).toContain("Cliente autorizado")
    expect(app.back().getAttribute("href")).toBe("/admin/operations/requests?page=3&size=10")
    await app.navigate("/admin/operations/requests/17?page=4&size=5")
    expect(app.back().getAttribute("href")).toBe("/admin/operations/requests?page=4&size=5")
    expect(app.text()).toContain("Cliente autorizado")
    app.http.expectNone(() => true)
  })

  it("cancels its pending read on destruction without destroying root read capability", async () => {
    const app = await setup()
    const pending = app.pending()
    await app.navigate("/admin/operations/requests")
    expect(pending.cancelled).toBe(true)
    expect(() => pending.flush(dto())).toThrow()
    app.http.expectNone(() => true)
    await app.navigate("/admin/operations/requests/18")
    app.pending(18).flush(dto(18))
    await app.settle()
    expect(app.text()).toContain("Cliente autorizado")
    app.http.expectNone(() => true)
  })

  it("releases only its observation on exit while an independent root observer keeps the shared flight alive", async () => {
    const app = await setup()
    const pending = app.pending()
    // Public independent consumer, not a component method or private-state shortcut.
    const other = app.store.observeRequest(17).subscribe()
    subscriptions.push(other)
    app.http.expectNone(() => true)
    await app.navigate("/admin/operations/requests")
    expect(pending.cancelled).toBe(false)
    pending.flush(dto())
    await app.settle()
    other.unsubscribe()
    await app.navigate("/admin/operations/requests/17")
    expect(app.text()).toContain("Cliente autorizado")
    app.http.expectNone(() => true)
  })

  it("cancels and fences pending work on identity or fixed-deadline replacement without detached retries", async () => {
    const app = await setup()
    for (const replacement of [identity(20), identity(20, deadline + 1)]) {
      const pending = app.pending()
      app.session.next(replacement)
      await app.settle()
      expect(pending.cancelled).toBe(true)
      expect(() => pending.flush(dto())).toThrow()
      expect(app.text()).not.toContain("Cliente autorizado")
      app.http.expectNone(() => true)
      await app.navigate("/admin/operations/requests")
      await app.navigate("/admin/operations/requests/17")
    }
    app.pending().flush(dto())
    await app.settle()
    expect(app.text()).toContain("Cliente autorizado")
    app.session.next(null)
    await app.settle()
    expect(app.text()).not.toContain("Cliente autorizado")
    app.http.expectNone(() => true)
  })

  it("preserves pending and verified work on same-session renewal but cancels on logout", async () => {
    const app = await setup()
    const pending = app.pending()
    app.session.next(identity(19, deadline, "Renewed caller"))
    await app.settle()
    expect(pending.cancelled).toBe(false)
    pending.flush(dto())
    await app.settle()
    app.session.next(identity(19, deadline, "Renewed again"))
    await app.settle()
    expect(app.text()).toContain("Cliente autorizado")
    app.http.expectNone(() => true)
    await app.navigate("/admin/operations/requests/18")
    const next = app.pending(18)
    app.session.next(null)
    await app.settle()
    expect(next.cancelled).toBe(true)
    expect(app.text()).not.toContain("Cliente autorizado")
    app.http.expectNone(() => true)
  })

  it.each(["server", "guest"] as const)(
    "dispatches no request reads for %s rendering",
    async mode => {
      const app = await setup("/admin/operations/requests/17", {
        server: mode === "server",
        guest: mode === "guest"
      })
      app.http.expectNone(() => true)
      expect(app.text()).not.toContain("Cliente autorizado")
      expect(app.text()).not.toContain("No registrado")
      if (mode === "server") {
        expect(app.observeSession).not.toHaveBeenCalled()
        expect(app.authFactory).not.toHaveBeenCalled()
      }
    }
  )

  it("returns through the public Router to the explicit effective numeric page and size only", async () => {
    const app = await setup(
      "/admin/operations/requests/17?page=2&size=5&customerId=99&status=cancelada"
    )
    app.pending().flush(dto())
    await app.settle()
    const link = app.back()
    expect(link.getAttribute("href")).toBe("/admin/operations/requests?page=2&size=5")
    link.click()
    await app.settle()
    expect(app.router.url).toBe("/admin/operations/requests?page=2&size=5")
    expect(app.text()).toContain("Bandeja de solicitudes")
    app.http.expectNone(() => true)
  })

  it("defaults invalid, duplicate or incomplete return pairs to 0/20 without refetching detail", async () => {
    const app = await setup()
    app.pending().flush(dto())
    await app.settle()
    for (const query of [
      "",
      "?page=2",
      "?size=5",
      "?page=1&page=2&size=5",
      "?page=2&size=5&size=10",
      "?page=-1&size=5",
      "?page=1.5&size=5",
      "?page=1&size=0",
      "?page=2147483648&size=5",
      "?page=2147483647&size=2147483647"
    ]) {
      await app.navigate(`/admin/operations/requests/17${query}`)
      expect(app.back().getAttribute("href")).toBe("/admin/operations/requests?page=0&size=20")
      expect(app.text()).toContain("Cliente autorizado")
      app.http.expectNone(() => true)
    }
    // The helper preserves valid requested sizes >100; this leaf must not silently clamp them.
    await app.navigate("/admin/operations/requests/17?page=1&size=200")
    expect(app.back().getAttribute("href")).toBe("/admin/operations/requests?page=1&size=200")
    app.http.expectNone(() => true)
  })
})
