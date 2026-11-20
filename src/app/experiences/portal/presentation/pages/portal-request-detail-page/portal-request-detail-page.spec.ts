import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideOperationsRequestReads } from "@/app/features/operations/operations.providers"
import { PortalRequestDetailPage } from "./portal-request-detail-page"

/** Destination only: the detail return link and route destruction are exercised without the list. */
@Component({ template: "<p>Mis solicitudes</p>" })
class PortalRequestsDestination {}

const api = "http://localhost:8080/api/solicitudes"
const deadline = 4102444800000
const customer = (id = 4, email = "cliente@example.test") =>
  AuthSession.create("Cliente Portal", email, "CLIENTE", deadline, id, 9, "es", [])

function dto(overrides: Record<string, unknown> = {}) {
  return {
    idSolicitud: 17,
    idCliente: 88,
    cliente: "Cliente Propio",
    idPropiedad: 31,
    propiedad: "Casa centro",
    idTipoServicio: 4,
    tipoServicio: "Limpieza profunda",
    descripcion: "Dejar la llave en portería" as string | null,
    fechaDeseada: "2026-03-10" as string | null,
    estado: "registrada",
    registradoPor: "Operador Propio",
    fechaRegistro: "2026-03-02T04:30:00-05:00",
    fechaActualizacion: null as string | null,
    ...overrides
  }
}

async function setup(options: { url?: string; server?: boolean } = {}) {
  TestBed.resetTestingModule()
  const session = new BehaviorSubject<AuthSession | null>(customer())
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideOperationsRequestReads(),
      provideRouter([
        { path: "portal/requests", component: PortalRequestsDestination },
        { path: "portal/requests/:id", component: PortalRequestDetailPage }
      ]),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } }
    ]
  })
  const harness = await RouterTestingHarness.create(options.url ?? "/portal/requests/17")
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement!
  const text = () => element().textContent ?? ""
  const http = TestBed.inject(HttpTestingController)
  const pending = (id = 17) => {
    const request = http.expectOne(`${api}/${id}`)
    expect(request.request.method).toBe("GET")
    // The backend scopes the detail to the caller: no customer id and no invented query.
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.transferCache).toBe(false)
    return request
  }
  const buttons = () =>
    Array.from(element().querySelectorAll<HTMLButtonElement>("button")).filter(
      button => !button.disabled
    )
  const back = () => {
    const link = Array.from(element().querySelectorAll<HTMLAnchorElement>("a[href]")).find(
      item => new URL(item.href).pathname === "/portal/requests"
    )
    expect(link, "Return link to Mis solicitudes").toBeDefined()
    return link!
  }
  const navigate = async (target: string) => {
    await TestBed.inject(Router).navigateByUrl(target)
    await settle()
  }
  const retry = async () => {
    const button = buttons().find(item => /reintentar/i.test(item.textContent ?? ""))
    expect(button, "Visible explicit retry action").toBeDefined()
    button!.click()
    await settle()
  }
  return { harness, element, text, http, pending, buttons, back, navigate, retry, session, settle }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    vi.restoreAllMocks()
  }
})

// WP10 T3/S7: one of the customer's own requests, read-only, scoped by the backend.
describe("PortalRequestDetailPage", () => {
  it.each(["0", "-3", "1.5", "abc", "2147483648", "17a"])(
    "renders no disponible for the malformed id %s without any read",
    async id => {
      const s = await setup({ url: `/portal/requests/${id}` })
      expect(s.element().querySelector("[data-detail-invalid]")).not.toBeNull()
      expect(s.text()).toContain("Solicitud no disponible")
      // A broken link is not a permission hint and never offers a retry.
      expect(s.text()).not.toMatch(/permiso/i)
      expect(s.buttons()).toHaveLength(0)
      expect(s.element().querySelector("[data-detail-unavailable]")).toBeNull()
      s.http.expectNone(() => true)
    }
  )

  it("renders the supplied request literally with no write or staff affordance", async () => {
    const s = await setup()
    expect(s.text()).toMatch(/Cargando solicitud/)
    expect(s.element().querySelector('[role="status"]')?.textContent).toMatch(/Cargando solicitud/)
    s.pending().flush(dto())
    await s.settle()

    const record = s.element().querySelector("[data-detail-record]")!
    expect(record).not.toBeNull()
    expect(record.textContent).toContain("Casa centro")
    expect(record.textContent).toContain("Limpieza profunda")
    expect(record.textContent).toContain("registrada")
    // Calendar dates stay the supplied calendar string; instants stay the supplied UTC value.
    expect(record.textContent).toContain("2026-03-10")
    expect(record.textContent).toContain("2026-03-02T09:30:00.000Z")
    expect(record.textContent).toContain("Dejar la llave en portería")
    // Nullable supplied fields use the project's existing absence copy.
    expect(record.textContent).toContain("No registrado")
    expect(record.textContent).not.toMatch(/\$|CLP|Total/)

    // Read-only: the only link is the way back and no administrative destination exists.
    expect(s.buttons()).toHaveLength(0)
    expect(
      Array.from(s.element().querySelectorAll<HTMLAnchorElement>("a[href]")).map(
        link => new URL(link.href).pathname
      )
    ).toEqual(["/portal/requests"])
    expect(s.element().querySelectorAll('a[href^="/admin"]')).toHaveLength(0)
    // Staff-only data supplied by the payload is never projected into the customer view.
    expect(s.text()).not.toContain("Operador Propio")
    expect(s.text()).not.toMatch(/Editar|Cancelar solicitud|Crear orden/)
    s.http.expectNone(candidate => candidate.method !== "GET")
  })

  it("treats the caller-scoped 404 as not available, never as a transient failure", async () => {
    const s = await setup()
    s.pending().flush({ mensaje: "RAW INTERNAL DETAIL" }, { status: 404, statusText: "Not Found" })
    await s.settle()
    const state = s.element().querySelector("[data-detail-unavailable]")!
    expect(state).not.toBeNull()
    expect(state.textContent).toContain("Solicitud no disponible")
    expect(state.textContent).toMatch(/no está disponible en tu cuenta/i)
    // Not a permission hint, not a retryable failure, and no leaked backend text.
    expect(state.textContent).not.toMatch(/permiso/i)
    expect(s.text()).not.toContain("RAW INTERNAL DETAIL")
    expect(s.element().querySelector("[data-detail-error]")).toBeNull()
    expect(s.element().querySelector("[data-detail-record]")).toBeNull()
    expect(s.buttons()).toHaveLength(0)
    s.http.expectNone(() => true)
  })

  it("drops an already verified record when the server answers 404 on refresh", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    s.pending().flush(dto())
    await s.settle()
    expect(s.element().querySelector("[data-detail-record]")).not.toBeNull()

    await s.navigate("/portal/requests/18")
    s.pending(18).flush(dto({ idSolicitud: 18, propiedad: "Otra propiedad" }))
    await s.settle()
    clock.mockReturnValue(31000)
    await s.navigate("/portal/requests/17")
    s.pending(17).flush({}, { status: 404, statusText: "Not Found" })
    await s.settle()
    expect(s.element().querySelector("[data-detail-unavailable]")).not.toBeNull()
    expect(s.element().querySelector("[data-detail-record]")).toBeNull()
    expect(s.text()).not.toContain("Casa centro")
    s.http.expectNone(() => true)
  })

  it("keeps verified data while refreshing and on a transient error, with a GET-only retry", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    s.pending().flush(dto())
    await s.settle()
    await s.navigate("/portal/requests/18")
    s.pending(18).flush(dto({ idSolicitud: 18, propiedad: "Otra propiedad" }))
    await s.settle()

    clock.mockReturnValue(31000)
    await s.navigate("/portal/requests/17")
    const refresh = s.pending(17)
    expect(s.element().querySelector("[data-detail-record]")?.textContent).toContain("Casa centro")
    expect(s.text()).toMatch(/Actualizando solicitud/)

    refresh.error(new ProgressEvent("error"))
    await s.settle()
    const error = s.element().querySelector("[data-detail-error]")!
    expect(error).not.toBeNull()
    expect(error.textContent).toMatch(/desactualizados/i)
    expect(s.element().querySelector("[data-detail-record]")?.textContent).toContain("Casa centro")

    await s.retry()
    const retried = s.pending(17)
    // Retry re-issues exactly the GET and keeps the verified record while it runs.
    expect(retried.request.method).toBe("GET")
    expect(s.element().querySelector("[data-detail-record]")?.textContent).toContain("Casa centro")
    retried.flush(dto())
    await s.settle()
    expect(s.element().querySelector("[data-detail-error]")).toBeNull()
    s.http.expectNone(candidate => candidate.method !== "GET")
  })

  it("keeps the list's effective paging in the return link when the URL carries it", async () => {
    const s = await setup({ url: "/portal/requests/17?page=2&size=10" })
    s.pending().flush(dto())
    await s.settle()
    expect(new URL(s.back().href).search).toBe("?page=2&size=10")
    expect(s.back().textContent).toMatch(/Volver a mis solicitudes/)

    // A malformed pair falls back to the documented first page instead of inventing one.
    const malformed = await setup({ url: "/portal/requests/17?page=x&size=10" })
    malformed.pending().flush(dto())
    await malformed.settle()
    expect(new URL(malformed.back().href).search).toBe("?page=0&size=20")
  })

  it("cancels its read on session replacement and reloads under the new session", async () => {
    const s = await setup()
    const first = s.pending()
    s.session.next(customer(5, "otra@example.test"))
    // The previous session's read never survives the replacement.
    expect(first.cancelled).toBe(true)
    await s.settle()
    const second = s.pending()
    expect(second.request.url).toBe(`${api}/17`)
    // A request that is not the new caller's answers 404, which stays "no disponible".
    second.flush({}, { status: 404, statusText: "Not Found" })
    await s.settle()
    expect(s.element().querySelector("[data-detail-unavailable]")).not.toBeNull()
    expect(s.text()).not.toContain("Casa centro")
    s.http.expectNone(() => true)
  })

  it("cancels a live read when the route is destroyed", async () => {
    const s = await setup()
    const request = s.pending()
    await s.navigate("/portal/requests")
    expect(request.cancelled).toBe(true)
    expect(s.text()).toContain("Mis solicitudes")
    s.http.expectNone(() => true)
  })

  it("dispatches no read on the server platform", async () => {
    await setup({ server: true })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
