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
import { StaffServicesPage } from "./staff-services-page"

const api = "http://localhost:8080/api/ordenes"
const stamp = "2026-03-02T04:30:00-05:00"

/** The backend label of the field staff seed role; the page never sends its staff id. */
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

function dto(id = 17, property = "Casa centro") {
  return {
    idOrden: id,
    codigo: `OS-2026-${String(id).padStart(6, "0")}`,
    estado: "PROGRAMADA",
    estadoNombre: "Programada",
    idSolicitud: 42,
    idCliente: 88,
    cliente: "Cliente Asignado",
    idPropiedad: 31,
    propiedad: property,
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

async function setup(options: { server?: boolean; url?: string } = {}) {
  TestBed.resetTestingModule()
  const session = signal(fieldStaff())
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideOperationsRequestReads(),
      provideRouter([{ path: "staff/services", component: StaffServicesPage }]),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: AuthStore, useValue: { session } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" }
    ]
  })
  const harness = await RouterTestingHarness.create(options.url ?? "/staff/services")
  const fixture = harness.fixture
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = harness.routeNativeElement! as HTMLElement
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
    // WP11 S4: the caller's scope comes from the session, never from a staff id in the query.
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
  return { fixture, element, http, request, settle, click }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    vi.restoreAllMocks()
  }
})

// WP11 T2/S4: exactly one caller-scoped page of assigned services, rendered as cards.
describe("StaffServicesPage", () => {
  it("loads the caller's assigned page with the supplied data only", async () => {
    const s = await setup()
    expect(s.element.querySelector("app-catalog-frame")).not.toBeNull()
    expect(s.element.querySelector("h1")?.textContent?.trim()).toBe("Mis servicios")
    expect(s.element.querySelector('[role="status"]')?.textContent).toMatch(/Cargando servicios/)
    s.request().flush(page(0, 20, 12))
    await s.settle()

    const text = s.element.textContent!
    expect(text).not.toMatch(/Cargando servicios/)
    expect(text).toContain("OS-2026-000017")
    expect(text).toContain("Programada")
    expect(text).toContain("Cliente Asignado")
    expect(text).toContain("Casa centro")
    expect(text).toContain("Limpieza profunda")
    // Supplied calendar/clock text is printed literally, never shifted by the browser timezone.
    expect(text).toContain("2026-03-12")
    expect(text).toContain("08:30:00")
    expect(text).toContain("11:00:00")
    expect(text).toContain("1–12 de 12")

    // Cards, not a wide table: one item per assigned service, readable on a phone.
    expect(s.element.querySelector("table")).toBeNull()
    const cards = Array.from(s.element.querySelectorAll("ul[aria-label] > li"))
    expect(s.element.querySelector("ul")?.getAttribute("aria-label")).toBe(
      "Mis servicios asignados"
    )
    expect(cards).toHaveLength(12)
    // No invented KPI, filter, action or status catalog.
    expect(s.element.querySelector(".catalog-metrics")).toBeNull()
    expect(s.element.querySelector("input, select")).toBeNull()
    expect(
      Array.from(s.element.querySelectorAll("button")).filter(button =>
        /crear|editar|cancelar|programar/i.test(button.textContent ?? "")
      )
    ).toHaveLength(0)
    s.http.expectNone(() => true)
  })

  it("distinguishes verified empty from an unverified failure with GET-only retry", async () => {
    const s = await setup()
    s.request().flush({ mensaje: "RAW INTERNAL DETAIL" }, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/permiso/i)
    expect(s.element.textContent).not.toMatch(/Aún no tienes servicios|RAW INTERNAL DETAIL/)
    expect(s.element.textContent).toMatch(/sin verificar/i)

    await s.click("Reintentar")
    s.request().flush(page(0, 20, 0))
    await s.settle()
    expect(s.element.textContent).toMatch(/Aún no tienes servicios asignados/)
    expect(s.element.textContent).toContain("0–0 de 0")
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
    s.http.expectNone(() => true)
  })

  it("adopts the effective page metadata returned by the server", async () => {
    const s = await setup()
    // Requested 20, answered 10: the effective metadata is what the page navigates with.
    s.request(0, 20).flush(page(0, 10, 12))
    await s.settle()
    expect(s.element.textContent).toContain("1–10 de 12")
    await s.click("Página siguiente")
    s.request(1, 10).flush(page(1, 10, 12))
    await s.settle()
    expect(s.element.textContent).toContain("11–12 de 12")
    expect(s.element.textContent).not.toContain("Propiedad 1000")
    s.http.expectNone(() => true)
  })

  it("keeps verified cards on an expired revisit, error and forced retry", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    s.request().flush(page(0, 20, 45))
    await s.settle()
    await s.click("Página siguiente")
    s.request(1).flush(page(1, 20, 45, dto(18, "Otra propiedad")))
    await s.settle()
    clock.mockReturnValue(31000)
    await s.click("Página anterior")
    const refresh = s.request()
    // The verified cards survive the refresh; the status copy is not a second state.
    expect(s.element.textContent).toContain("Casa centro")
    expect(s.element.textContent).not.toContain("Otra propiedad")
    expect(s.element.textContent).toMatch(/Actualizando servicios/)

    refresh.error(new ProgressEvent("error"))
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/desactualizados/i)
    expect(s.element.textContent).toContain("Casa centro")

    await s.click("Reintentar")
    s.request().flush(page(0, 20, 45))
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
    expect(s.element.textContent).toContain("1–20 de 45")
    s.http.expectNone(() => true)
  })

  it("recovers once from an empty out-of-range page using the effective metadata", async () => {
    const s = await setup()
    s.request().flush(page(0, 20, 45))
    await s.settle()
    await s.click("Página 3")
    // The list shrank: this page is now beyond the verified total.
    s.request(2).flush(page(2, 20, 5))
    await s.settle()
    s.request(0).flush(page(0, 20, 5))
    await s.settle()
    expect(s.element.textContent).toContain("Propiedad 1001")
    expect(s.element.textContent).toContain("1–5 de 5")
    s.http.expectNone(() => true)
  })

  it("reads the entry page from page/size and lets each row link carry that effective page", async () => {
    const s = await setup({ url: "/staff/services?page=2&size=5" })
    s.request(2, 5).flush(page(2, 5, 12))
    await s.settle()
    expect(s.element.textContent).toContain("11–12 de 12")
    // The row link publishes the effective page, not the requested one and not a bare id.
    const row = Array.from(s.element.querySelectorAll<HTMLAnchorElement>("a")).find(
      item => item.textContent?.trim() === "OS-2026-000017"
    )
    expect(row?.getAttribute("href")).toBe("/staff/services/17?page=2&size=5")
    s.http.expectNone(() => true)
  })

  it("falls back to the whole first page for a malformed or oversized pair", async () => {
    // A size above the documented maximum is refused, never silently clamped to it.
    const oversized = await setup({ url: "/staff/services?page=1&size=101" })
    oversized.request(0, 20).flush(page(0, 20, 12))
    await oversized.settle()
    expect(oversized.element.textContent).toContain("1–12 de 12")
    oversized.http.expectNone(() => true)
  })

  it("dispatches no read on the server platform", async () => {
    const s = await setup({ server: true })
    expect(s.element.querySelector("hlm-spinner")).toBeNull()
    expect(s.element.textContent).not.toMatch(/Cargando servicios/)
    s.http.expectNone(() => true)
  })
})
