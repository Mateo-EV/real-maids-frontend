import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { EMPTY } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideOperationsRequestReads } from "@/app/features/operations/operations.providers"
import { PortalServiceDetailPage } from "../portal-service-detail-page/portal-service-detail-page"
import { PortalServicesPage } from "./portal-services-page"

const api = "http://localhost:8080/api/ordenes"
const portalServices = "/portal/services"
const stamp = "2026-03-02T04:30:00-05:00"
const customer = () =>
  AuthSession.create("Cliente Portal", "cliente@example.test", "CLIENTE", null, 9, 4, "es", [])

/** Supplied staff contact data never reaches the customer surface, even inside the payload. */
function staff(id = 21) {
  return {
    idPersonal: id,
    nombre: `Personal ${id}`,
    telefono: "+56 9 1111 2222",
    rol: "RESPONSABLE"
  }
}

function dto(id = 17, property = "Casa centro", service = "Limpieza profunda") {
  return {
    idOrden: id,
    codigo: `OS-2026-${String(id).padStart(6, "0")}`,
    estado: "PROGRAMADA",
    estadoNombre: "Programada",
    idSolicitud: 42,
    idCliente: 88,
    cliente: "Cliente Propio",
    idPropiedad: 31,
    propiedad: property,
    idTipoServicio: 4,
    tipoServicio: service,
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
    asignados: [staff()],
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

async function setup(options: { url?: string; server?: boolean } = {}) {
  TestBed.resetTestingModule()
  const session = signal<AuthSession | null>(customer())
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideOperationsRequestReads(),
      provideRouter([
        { path: "portal/services", component: PortalServicesPage },
        { path: "portal/services/:id", component: PortalServiceDetailPage }
      ]),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: AuthStore, useValue: { session: () => session() } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" }
    ]
  })
  const harness = await RouterTestingHarness.create(options.url ?? portalServices)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = harness.routeNativeElement!
  const http = TestBed.inject(HttpTestingController)
  const router = TestBed.inject(Router)
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
  return { harness, element, http, request, settle, click, session, router }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    vi.restoreAllMocks()
  }
})

// WP10 T4/S7: the customer's own read-only service orders, no client-side scoping.
describe("PortalServicesPage", () => {
  it("loads the caller's own first page with the supplied data only", async () => {
    const s = await setup()
    expect(s.element.querySelector("app-catalog-frame")).not.toBeNull()
    expect(s.element.querySelector("h1")?.textContent?.trim()).toBe("Mis servicios")
    expect(s.element.textContent).toMatch(/Cargando servicios/)
    expect(s.element.querySelector('[role="status"]')?.textContent).toMatch(/Cargando servicios/)
    const pending = s.request()
    pending.flush(page(0, 20, 12))
    await s.settle()

    const text = s.element.textContent!
    expect(text).not.toMatch(/Cargando servicios/)
    expect(text).toContain("OS-2026-000017")
    expect(text).toContain("Programada")
    expect(text).toContain("Casa centro")
    expect(text).toContain("Limpieza profunda")
    // The schedule keeps the supplied calendar date and clock text, never a timezone shift.
    expect(text).toContain("2026-03-12")
    expect(text).toContain("08:30:00")
    expect(text).toContain("11:00:00")
    expect(text).toContain("1–12 de 12")
    expect(text).not.toMatch(/No registrado/)

    // Accessible names for both responsive presentations.
    expect(s.element.querySelector("table caption")?.textContent?.trim()).toBe(
      "Mis servicios de limpieza"
    )
    expect(s.element.querySelector("ul[aria-label]")?.getAttribute("aria-label")).toBe(
      "Mis servicios de limpieza"
    )

    // Every row opens its own read-only detail, and the effective page context travels in the URL.
    const desktop = Array.from(s.element.querySelectorAll<HTMLAnchorElement>("table a[href]"))
    const mobile = Array.from(
      s.element.querySelectorAll<HTMLAnchorElement>("ul[aria-label] a[href]")
    )
    expect(desktop).toHaveLength(12)
    expect(mobile).toHaveLength(12)
    expect(new URL(desktop[0].href).pathname).toBe("/portal/services/17")
    expect(new URL(desktop[0].href).search).toBe("?page=0&size=20")
    expect(desktop[0].getAttribute("aria-label")).toBe("Ver detalle del servicio 17")
    expect(new URL(mobile[0].href).pathname).toBe("/portal/services/17")
    expect(mobile[0].getAttribute("aria-label")).toBe("Ver detalle del servicio 17")
    // Still no write action anywhere in the list.
    expect(
      Array.from(s.element.querySelectorAll("button")).filter(button =>
        /crear|editar|cancelar|programar/i.test(button.textContent ?? "")
      )
    ).toHaveLength(0)
    s.http.expectNone(() => true)
  })

  it("projects no access instruction, door code or staff contact", async () => {
    const s = await setup()
    // The supplied payload carries staff contact data that the customer surface must not print.
    s.request().flush(page(0, 20, 12))
    await s.settle()
    const html = s.element.outerHTML
    expect(html).not.toContain("+56 9 1111 2222")
    expect(html).not.toContain("SYNTHETIC ACCESS")
    expect(html).not.toContain("SYNTHETIC CODE")
    // Staff are not part of the list projection at all.
    expect(s.element.textContent).not.toContain("Personal 21")
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
    expect(s.element.textContent).toMatch(/Aún no tienes servicios/)
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
    // The detail links follow the effective metadata, not the requested page.
    const link = s.element.querySelector<HTMLAnchorElement>("table a[href]")!
    expect(new URL(link.href).search).toBe("?page=1&size=10")
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
    expect(s.element.textContent).toMatch(/Actualizando servicios/)

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
    // URL paging is never a server-platform read: hydration dispatches nothing either way.
    await setup({ server: true, url: "/portal/services?page=2&size=10" })
    expect(TestBed.inject(HttpTestingController)).toBeTruthy()
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })

  // Entry paging comes from the URL, so the detail's return link restores the visited page.
  // The list still never writes paging back on its own navigation.
  describe("URL paging on entry", () => {
    it.each([
      ["page=2&size=10", 2, 10],
      ["page=0&size=100", 0, 100],
      ["page=1&size=100", 1, 100]
    ])("adopts %s as the initial request", async (search, pagina, tamanio) => {
      const s = await setup({ url: `/portal/services?${search}` })
      s.request(pagina, tamanio).flush(page(pagina, tamanio, 250))
      await s.settle()
      expect(s.element.textContent).not.toMatch(/Cargando servicios/)
      expect(s.element.querySelector('[role="alert"]')).toBeNull()
      s.http.expectNone(() => true)
    })

    // One representative per fallback family: incomplete, duplicated, negative and out-of-int32.
    // The whole fallback matrix belongs to the shared contract suite (portal-paging.spec.ts), so it
    // is asserted once there instead of three times, once per list.
    it.each(["page=2", "page=1&page=2&size=10", "page=-1&size=10", "page=2147483648&size=10"])(
      "falls back to the first page for the malformed pair %s",
      async search => {
        const s = await setup({ url: `/portal/services?${search}` })
        s.request(0, 20).flush(page(0, 20, 12))
        await s.settle()
        expect(s.element.textContent).toContain("1–12 de 12")
        // Only the documented pagina/tamanio pair travels: no invented offset or clamp.
        s.http.expectNone(() => true)
      }
    )

    it("never dispatches a size above the documented maximum", async () => {
      const s = await setup({ url: "/portal/services?page=1&size=101" })
      // The whole pair falls back instead of sending an out-of-contract tamanio.
      s.request(0, 20).flush(page(0, 20, 12))
      await s.settle()
      expect(s.element.textContent).toContain("1–12 de 12")
      s.http.expectNone(() => true)
    })

    it("returns from a detail to the same effective page", async () => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
      const s = await setup({ url: "/portal/services?page=2&size=10" })
      s.request(2, 10).flush(page(2, 10, 45))
      await s.settle()
      expect(s.element.textContent).toContain("21–30 de 45")

      const link = s.element.querySelector<HTMLAnchorElement>("table a[href]")!
      const target = new URL(link.href)
      expect(target.pathname).toBe("/portal/services/17")
      expect(target.search).toBe("?page=2&size=10")

      await s.router.navigateByUrl(`${target.pathname}${target.search}`)
      await s.settle()
      s.http.expectOne(candidate => candidate.url === `${api}/17`).flush(detailDto())
      await s.settle()

      const detail = s.harness.routeNativeElement!
      const back = Array.from(detail.querySelectorAll<HTMLAnchorElement>("a[href]")).find(
        item => new URL(item.href).pathname === portalServices
      )!
      expect(new URL(back.href).search).toBe("?page=2&size=10")

      // A new visit past the freshness window reads the page the customer came from.
      clock.mockReturnValue(31000)
      await s.router.navigateByUrl(`${new URL(back.href).pathname}${new URL(back.href).search}`)
      await s.settle()
      s.request(2, 10).flush(page(2, 10, 45))
      await s.settle()
      expect(s.harness.routeNativeElement!.textContent).toContain("21–30 de 45")
      s.http.expectNone(() => true)
    })
  })
})

/** Detail wire body, shared by the round-trip case above. */
function detailDto() {
  return {
    orden: dto(),
    propiedad: {
      idPropiedad: 31,
      idCliente: 88,
      alias: null,
      direccion: "Casa centro 123",
      ciudad: null,
      estadoRegion: null,
      codigoPostal: null,
      areaM2: 12.5,
      numeroAmbientes: 3,
      numeroBanos: 2,
      instruccionesAcceso: "SYNTHETIC ACCESS",
      codigoPuerta: "SYNTHETIC CODE",
      tieneMascotas: false,
      activo: true,
      fechaCreacion: stamp
    },
    historial: [],
    programaciones: []
  }
}
