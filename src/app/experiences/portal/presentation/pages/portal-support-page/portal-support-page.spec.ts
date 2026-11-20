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
import { provideCustomerSupportReads } from "@/app/features/customer-support/customer-support.providers"
import { PortalSupportDetailPage } from "../portal-support-detail-page/portal-support-detail-page"
import { PortalSupportPage } from "./portal-support-page"

const api = "http://localhost:8080/api/atenciones"
const portalSupport = "/portal/support"
const customer = () =>
  AuthSession.create("Cliente Portal", "cliente@example.test", "CLIENTE", null, 9, 4, "es", [])

/** Wire DTO of AtencionResponse; the adapter rejects any partial or misaligned page. */
function dto(
  id = 17,
  subject = "Consulta de facturación",
  stateName = "En revisión",
  type = "Consulta"
) {
  return {
    idAtencion: id,
    idCliente: 88,
    cliente: "Cliente Propio",
    idOrden: null,
    codigoOrden: null,
    idTipo: 4,
    tipo: type,
    requiereRespuesta: true,
    estado: "EN_REVISION",
    estadoNombre: stateName,
    asunto: subject,
    descripcion: "Descripción literal de la atención",
    fechaRegistro: "2026-03-02T04:30:00-05:00",
    fechaCierre: null
  }
}

/** A complete page for the adapter: the item count must match `total` at that offset. */
function page(pagina = 0, tamanio = 20, totalElementos = 12, first = dto()) {
  const count = Math.min(tamanio, Math.max(0, totalElementos - pagina * tamanio))
  return {
    contenido: Array.from({ length: count }, (_, index) =>
      index === 0 ? first : dto(1000 + index, `Asunto ${1000 + index}`)
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
      provideCustomerSupportReads(),
      provideRouter([
        { path: "portal/support", component: PortalSupportPage },
        { path: "portal/support/:id", component: PortalSupportDetailPage }
      ]),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: AuthStore, useValue: { session: () => session() } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" }
    ]
  })
  const harness = await RouterTestingHarness.create(options.url ?? portalSupport)
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

// WP10 T5/S7: the customer's own attentions, read-only, scoped by the backend.
describe("PortalSupportPage", () => {
  it("loads the caller's own first page with the supplied data only", async () => {
    const s = await setup()
    expect(s.element.querySelector("app-catalog-frame")).not.toBeNull()
    expect(s.element.querySelector("h1")?.textContent?.trim()).toBe("Soporte")
    expect(s.element.textContent).toMatch(/Cargando atenciones/)
    const pending = s.request()
    pending.flush(page(0, 20, 12))
    await s.settle()

    const text = s.element.textContent!
    expect(text).not.toMatch(/Cargando atenciones/)
    expect(text).toContain("Consulta de facturación")
    expect(text).toContain("Consulta")
    expect(text).toContain("En revisión")
    // The supplied registration instant is printed as the supplied UTC value.
    expect(text).toContain("2026-03-02T09:30:00.000Z")
    expect(text).toContain("1–12 de 12")

    // Accessible names for both responsive presentations.
    expect(s.element.querySelector("table caption")?.textContent?.trim()).toBe(
      "Mis atenciones de soporte"
    )
    expect(s.element.querySelector("ul[aria-label]")?.getAttribute("aria-label")).toBe(
      "Mis atenciones de soporte"
    )

    // Every row opens its own read-only detail, and the effective page context travels in the URL.
    const desktop = Array.from(s.element.querySelectorAll<HTMLAnchorElement>("table a[href]"))
    const mobile = Array.from(
      s.element.querySelectorAll<HTMLAnchorElement>("ul[aria-label] a[href]")
    )
    expect(desktop).toHaveLength(12)
    expect(mobile).toHaveLength(12)
    expect(new URL(desktop[0].href).pathname).toBe("/portal/support/17")
    expect(new URL(desktop[0].href).search).toBe("?page=0&size=20")
    expect(desktop[0].getAttribute("aria-label")).toBe("Ver detalle de la atención 17")
    expect(new URL(mobile[0].href).pathname).toBe("/portal/support/17")
    expect(mobile[0].getAttribute("aria-label")).toBe("Ver detalle de la atención 17")
    s.http.expectNone(() => true)
  })

  it("prints the supplied state text literally instead of deriving one", async () => {
    const s = await setup()
    s.request().flush(page(0, 20, 1, dto(17, "Aviso de cobro", "Recibida por el equipo", "Queja")))
    await s.settle()
    // The display text is the supplied one, never a translation of the closed state code.
    const badge = s.element.querySelector("[data-support-state]")!
    expect(badge).not.toBeNull()
    expect(badge.textContent?.trim()).toBe("Recibida por el equipo")
    expect(s.element.textContent).not.toContain("EN_REVISION")
    expect(s.element.textContent).not.toContain("Queja no")
    s.http.expectNone(() => true)
  })

  it("renders no write affordance and no internal contact data", async () => {
    const s = await setup()
    s.request().flush(page(0, 20, 12))
    await s.settle()
    const html = s.element.outerHTML
    // Staff-only payload data never reaches the customer surface.
    expect(html).not.toContain("Cliente Propio")
    // No create, reply, transition or close action exists on this read-only screen.
    expect(
      Array.from(s.element.querySelectorAll("button")).filter(button =>
        /crear|editar|responder|cancelar|cerrar|cambiar estado/i.test(button.textContent ?? "")
      )
    ).toHaveLength(0)
    expect(s.element.querySelectorAll('a[href^="/admin"]')).toHaveLength(0)
    s.http.expectNone(() => true)
  })

  it("distinguishes verified empty from an unverified failure with GET-only retry", async () => {
    const s = await setup()
    s.request().flush({ mensaje: "RAW INTERNAL DETAIL" }, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/permiso/i)
    expect(s.element.textContent).not.toMatch(/Aún no tienes atenciones|RAW INTERNAL DETAIL/)
    expect(s.element.textContent).toMatch(/sin verificar/i)

    await s.click("Reintentar")
    s.request().flush(page(0, 20, 0))
    await s.settle()
    expect(s.element.textContent).toMatch(/Aún no tienes atenciones/)
    expect(s.element.textContent).toContain("0–0 de 0")
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
    s.http.expectNone(() => true)
  })

  it("navigates with the effective returned metadata of the page", async () => {
    const s = await setup({ url: "/portal/support?page=0&size=10" })
    s.request(0, 10).flush(page(0, 10, 12))
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

  it("refuses an answer whose effective size differs from the requested page", async () => {
    const s = await setup()
    // This module refuses a different effective size: those rows would not start at the asked offset.
    s.request(0, 20).flush(page(0, 10, 12))
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')).not.toBeNull()
    expect(s.element.textContent).toMatch(/No se pudieron cargar tus atenciones/)
    expect(s.element.textContent).not.toMatch(/Aún no tienes atenciones/)
    expect(s.element.textContent).toContain("Resultados sin verificar")
    s.http.expectNone(() => true)
  })

  it("keeps verified rows on an expired same-query revisit, error and forced retry", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    s.request().flush(page(0, 20, 45))
    await s.settle()
    await s.click("Página siguiente")
    expect(s.element.textContent).not.toContain("Consulta de facturación")
    s.request(1).flush(page(1, 20, 45, dto(18, "Otro asunto")))
    await s.settle()
    clock.mockReturnValue(31000 + 1000)
    await s.click("Página anterior")
    const refresh = s.request()
    // The verified rows survive the refresh; the status copy is not a second state.
    expect(s.element.textContent).toContain("Consulta de facturación")
    expect(s.element.textContent).not.toContain("Otro asunto")
    expect(s.element.textContent).toMatch(/Actualizando atenciones/)

    refresh.error(new ProgressEvent("error"))
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/desactualizados/i)
    expect(s.element.textContent).toContain("Consulta de facturación")

    await s.click("Reintentar")
    const retry = s.request()
    expect(s.element.textContent).toContain("Consulta de facturación")
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
    expect(s.element.textContent).toContain("Asunto 1001")
    expect(s.element.textContent).toContain("1–5 de 5")
    s.http.expectNone(() => true)
  })

  it("dispatches no read on the server platform", async () => {
    // URL paging is never a server-platform read: hydration dispatches nothing either way.
    await setup({ server: true, url: "/portal/support?page=2&size=10" })
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
      const s = await setup({ url: `/portal/support?${search}` })
      s.request(pagina, tamanio).flush(page(pagina, tamanio, 250))
      await s.settle()
      expect(s.element.textContent).not.toMatch(/Cargando atenciones/)
      expect(s.element.querySelector('[role="alert"]')).toBeNull()
      s.http.expectNone(() => true)
    })

    it.each([
      "page=2",
      "size=10",
      "page=-1&size=10",
      "page=1.5&size=10",
      "page=abc&size=10",
      "page=2147483648&size=10",
      "page=1&size=0",
      "page=1&size=one",
      "page=1&size=2147483648",
      "page=1&page=2&size=10",
      "page=0&size=10&size=20",
      "page=&size=10",
      "page=1&size="
    ])("falls back to the first page for the malformed pair %s", async search => {
      const s = await setup({ url: `/portal/support?${search}` })
      s.request(0, 20).flush(page(0, 20, 12))
      await s.settle()
      expect(s.element.textContent).toContain("1–12 de 12")
      // Only the documented pagina/tamanio pair travels: no invented offset or clamp.
      s.http.expectNone(() => true)
    })

    it("never dispatches a size above the documented maximum", async () => {
      const s = await setup({ url: "/portal/support?page=1&size=101" })
      // The whole pair falls back instead of sending an out-of-contract tamanio.
      s.request(0, 20).flush(page(0, 20, 12))
      await s.settle()
      expect(s.element.textContent).toContain("1–12 de 12")
      s.http.expectNone(() => true)
    })

    it("returns from a detail to the same effective page", async () => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
      const s = await setup({ url: "/portal/support?page=2&size=10" })
      s.request(2, 10).flush(page(2, 10, 45))
      await s.settle()
      expect(s.element.textContent).toContain("21–30 de 45")

      const link = s.element.querySelector<HTMLAnchorElement>("table a[href]")!
      const target = new URL(link.href)
      expect(target.pathname).toBe("/portal/support/17")
      expect(target.search).toBe("?page=2&size=10")

      await s.router.navigateByUrl(`${target.pathname}${target.search}`)
      await s.settle()
      s.http.expectOne(candidate => candidate.url === `${api}/17`).flush(detailDto())
      await s.settle()

      const detail = s.harness.routeNativeElement!
      const back = Array.from(detail.querySelectorAll<HTMLAnchorElement>("a[href]")).find(
        item => new URL(item.href).pathname === portalSupport
      )!
      expect(new URL(back.href).search).toBe("?page=2&size=10")

      // A new visit past the freshness window reads the page the customer came from.
      clock.mockReturnValue(31000 + 1000)
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
    atencion: dto(),
    seguimiento: [
      {
        idSeguimiento: 90,
        autor: null,
        delCliente: false,
        mensaje: "Revisando",
        fecha: "2026-03-03T09:00:00Z"
      }
    ]
  }
}
