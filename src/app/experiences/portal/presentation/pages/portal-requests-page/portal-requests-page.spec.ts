import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { EMPTY } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideOperationsRequestReads } from "@/app/features/operations/operations.providers"
import { PortalRequestsPage } from "./portal-requests-page"

const api = "http://localhost:8080/api/solicitudes"
const portalRequests = "/portal/requests"
const customer = () =>
  AuthSession.create("Cliente Portal", "cliente@example.test", "CLIENTE", null, 9, 4, "es", [])

function dto(id = 17, property = "Casa centro", service = "Limpieza profunda") {
  return {
    idSolicitud: id,
    idCliente: 88,
    cliente: "Cliente Propio",
    idPropiedad: 31,
    propiedad: property,
    idTipoServicio: 4,
    tipoServicio: service,
    descripcion: null,
    fechaDeseada: "2026-03-10",
    estado: "registrada",
    registradoPor: "Operador Propio",
    fechaRegistro: "2026-03-02T04:30:00-05:00",
    fechaActualizacion: null
  }
}

/** A complete page for the adapter: the item count must match `total` at that offset. */
function page(pagina = 0, tamanio = 20, totalElementos = 12, first = dto()) {
  const count = Math.min(tamanio, Math.max(0, totalElementos - pagina * tamanio))
  return {
    contenido: Array.from({ length: count }, (_, index) =>
      index === 0 ? first : dto(1000 + index, `Propiedad ${1000 + index}`)
    ),
    pagina,
    tamanio,
    totalElementos,
    totalPaginas: Math.ceil(totalElementos / tamanio)
  }
}

async function setup(options: { url?: string; server?: boolean } = {}) {
  TestBed.resetTestingModule()
  const session = signal<AuthSession | null>(customer())
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideOperationsRequestReads(),
      provideRouter([{ path: "portal/requests", component: PortalRequestsPage }]),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: AuthStore, useValue: { session: () => session() } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" }
    ]
  })
  const harness = await RouterTestingHarness.create(options.url ?? portalRequests)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = harness.routeNativeElement!
  const http = TestBed.inject(HttpTestingController)
  const request = (pagina = 0, tamanio = 20) => {
    const pending = http.expectOne(
      candidate =>
        candidate.url === api &&
        candidate.params.get("pagina") === String(pagina) &&
        candidate.params.get("tamanio") === String(tamanio)
    )
    expect(pending.request.method).toBe("GET")
    expect(pending.request.transferCache).toBe(false)
    // The backend scopes the list to the caller: no customer id and no invented filter travels.
    expect(pending.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    return pending
  }
  const click = async (label: string) => {
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    expect(button!.disabled, label).toBe(false)
    button!.click()
    await settle()
  }
  return { harness, element, http, request, settle, click, session }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    vi.restoreAllMocks()
  }
})

// WP10 T2/S7: the customer's own read-only requests list, no client-side scoping.
describe("PortalRequestsPage", () => {
  it("loads the caller's own first page in the shared catalog frame", async () => {
    const s = await setup()
    expect(s.element.querySelector("app-catalog-frame")).not.toBeNull()
    expect(s.element.querySelector("h1")?.textContent?.trim()).toBe("Mis solicitudes")
    expect(s.element.textContent).toMatch(/Cargando solicitudes/)
    expect(s.element.querySelector('[role="status"]')?.textContent).toMatch(/Cargando solicitudes/)
    const pending = s.request()
    pending.flush(page(0, 20, 12))
    await s.settle()

    const text = s.element.textContent!
    expect(text).not.toMatch(/Cargando solicitudes/)
    expect(text).toContain("Casa centro")
    expect(text).toContain("Limpieza profunda")
    expect(text).toContain("registrada")
    expect(text).toContain("2026-03-10")
    // Registered instants stay the supplied UTC value, not a browser timezone shift.
    expect(text).toContain("2026-03-02T09:30:00.000Z")
    expect(text).toContain("1–12 de 12")
    expect(text).not.toMatch(/No registrado|\$|CLP/)

    // Accessible names for both responsive presentations.
    expect(s.element.querySelector("table caption")?.textContent?.trim()).toBe(
      "Mis solicitudes de servicio"
    )
    expect(s.element.querySelector("ul[aria-label]")?.getAttribute("aria-label")).toBe(
      "Mis solicitudes de servicio"
    )

    // Plain data for now: no detail link and no write action is offered.
    expect(s.element.querySelectorAll("a")).toHaveLength(0)
    expect(
      Array.from(s.element.querySelectorAll("button")).filter(button =>
        /crear|editar|cancelar/i.test(button.textContent ?? "")
      )
    ).toHaveLength(0)
    s.http.expectNone(() => true)
  })

  it("distinguishes verified empty from an unverified failure with GET-only retry", async () => {
    const s = await setup()
    s.request().flush({ mensaje: "RAW INTERNAL DETAIL" }, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/permiso/i)
    expect(s.element.textContent).not.toMatch(/Aún no tienes solicitudes|RAW INTERNAL DETAIL/)
    expect(s.element.textContent).toMatch(/sin verificar/i)

    await s.click("Reintentar")
    s.request().flush(page(0, 20, 0))
    await s.settle()
    expect(s.element.textContent).toMatch(/Aún no tienes solicitudes/)
    expect(s.element.textContent).toContain("0–0 de 0")
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
    s.http.expectNone(() => true)
  })

  it("adopts the effective page size returned by the server for navigation", async () => {
    const s = await setup()
    // Requested 20, answered 10: the effective metadata is what the page navigates with.
    s.request(0, 20).flush(page(0, 10, 12))
    await s.settle()
    expect(s.element.textContent).toContain("1–10 de 12")
    await s.click("Página siguiente")
    s.request(1, 10).flush(page(1, 10, 12))
    await s.settle()
    expect(s.element.textContent).toContain("11–12 de 12")
    s.http.expectNone(() => true)
  })

  it("keeps verified rows on an expired same-query revisit, error and forced retry", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    s.request().flush(page(0, 20, 45))
    await s.settle()
    await s.click("Página siguiente")
    expect(s.element.textContent).not.toContain("Casa centro")
    s.request(1).flush(page(1, 20, 45, dto(18, "Otra propiedad")))
    await s.settle()
    clock.mockReturnValue(31000)
    await s.click("Página anterior")
    const refresh = s.request()
    // The verified rows survive the refresh; the status copy is not a second state.
    expect(s.element.textContent).toContain("Casa centro")
    expect(s.element.textContent).not.toContain("Otra propiedad")
    expect(s.element.textContent).toMatch(/Actualizando solicitudes/)

    refresh.error(new ProgressEvent("error"))
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/desactualizados/i)
    expect(s.element.textContent).toContain("Casa centro")

    await s.click("Reintentar")
    const retry = s.request()
    expect(s.element.textContent).toContain("Casa centro")
    retry.flush(page(0, 20, 45))
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
    s.http.expectNone(() => true)
  })

  it("recovers once from an empty out-of-range page using the effective metadata", async () => {
    const s = await setup()
    s.request().flush(page(0, 20, 45))
    await s.settle()
    await s.click("Página 3")
    // The catalog shrank: this page is now beyond the verified total.
    s.request(2).flush(page(2, 20, 5))
    await s.settle()
    s.request(0).flush(page(0, 20, 5))
    await s.settle()
    expect(s.element.textContent).toContain("Propiedad 1001")
    expect(s.element.textContent).toContain("1–5 de 5")
    s.http.expectNone(() => true)
  })

  it("dispatches no read on the server platform", async () => {
    await setup({ server: true })
    expect(TestBed.inject(HttpTestingController)).toBeTruthy()
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
