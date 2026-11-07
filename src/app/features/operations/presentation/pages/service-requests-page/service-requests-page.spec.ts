import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, Subscription } from "rxjs"
import { HotToastService } from "@ngxpert/hot-toast"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideOperationsRequestReads } from "../../../operations.providers"
import { ServiceRequestsStore } from "../../state/service-requests.store"
import { ServiceRequestsPage } from "./service-requests-page"
import { AgendaPage } from "../agenda-page/agenda-page"

const api = "https://api.example.test/api/solicitudes"
const inbox = "/admin/operations/requests"
const deadline = 4102444800000
const caller = (id = 19, expires = deadline, name = "Caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, expires, id)
const dto = (id = 17, customer = "Cliente suministrado") => ({
  idSolicitud: id,
  idCliente: 88,
  cliente: customer,
  idPropiedad: 31,
  propiedad: "Oficina norte",
  idTipoServicio: 4,
  tipoServicio: "Limpieza profunda",
  descripcion: null,
  fechaDeseada: "2026-03-10",
  estado: "registrada",
  registradoPor: "Operador suministrado",
  fechaRegistro: "2026-03-02T04:30:00-05:00",
  fechaActualizacion: null
})
// Supply complete pages: the actual adapter rejects partial non-final pages.
const page = (pagina = 0, tamanio = 20, totalElementos = 45, first = dto()) => {
  const count = Math.min(tamanio, Math.max(0, totalElementos - pagina * tamanio))
  return {
    contenido: Array.from({ length: count }, (_, i) =>
      i === 0 ? first : dto(1000 + i, `Cliente ${1000 + i}`)
    ),
    pagina,
    tamanio,
    totalElementos,
    totalPaginas: Math.ceil(totalElementos / tamanio)
  }
}

@Component({ template: "<p>Navigation target</p>" })
class NavigationTarget {}

const subscriptions: Subscription[] = []
async function setup(options: { url?: string; server?: boolean; guest?: boolean } = {}) {
  const session = new BehaviorSubject<AuthSession | null>(options.guest ? null : caller())
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideOperationsRequestReads(),
      { provide: HotToastService, useValue: { success: vi.fn() } },
      provideRouter([
        { path: "admin/operations/requests", component: ServiceRequestsPage },
        { path: "admin/operations/requests/:id", component: NavigationTarget },
        { path: "admin/operations/orders", component: NavigationTarget },
        { path: "admin/operations/agenda", component: AgendaPage },
        { path: "elsewhere", component: NavigationTarget }
      ]),
      { provide: API_URL, useValue: "https://api.example.test" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" }
    ]
  })
  const harness = await RouterTestingHarness.create(options.url ?? inbox)
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
      r =>
        r.url === api &&
        r.params.get("pagina") === String(pagina) &&
        r.params.get("tamanio") === String(tamanio)
    )
    expect(pending.request.method).toBe("GET")
    expect(pending.request.transferCache).toBe(false)
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
    subscriptions.splice(0).forEach(subscription => subscription.unsubscribe())
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

// WP7 T5 / S1-S4: leaf consumer contracts, not root route/sidebar integration.
// The importable RED stub intentionally performs no observation or HTTP.
describe("ServiceRequestsPage inbox", () => {
  // T6F / S1,S3,S4,S5,S6,S8: navigation is feature-local, not a sidebar change.
  it.each(["loading", "empty", "error"] as const)(
    "exposes working Solicitudes/Órdenes links in CatalogFrame controls during %s",
    async state => {
      const s = await setup({ url: `${inbox}?page=2&size=5` })
      const pending = s.request(2, 5)
      if (state === "empty") pending.flush(page(2, 5, 0))
      else if (state === "error") pending.error(new ProgressEvent("error"))
      await s.settle()
      const controls = s.element.querySelector("app-catalog-frame header [catalogControls]")!
      expect(controls, "CatalogFrame header controls").not.toBeNull()
      const requests = controls.querySelector<HTMLAnchorElement>(`a[href="${inbox}"]`)
      const orders = controls.querySelector<HTMLAnchorElement>('a[href="/admin/operations/orders"]')
      expect(requests?.textContent?.trim()).toBe("Solicitudes")
      expect(requests?.getAttribute("aria-current")).toBe("page")
      expect(orders?.textContent?.trim()).toBe("Órdenes")
      expect(orders?.getAttribute("aria-current")).toBeNull()
      const agenda = controls.querySelector<HTMLAnchorElement>('a[href="/admin/operations/agenda"]')
      expect(agenda?.textContent?.trim()).toBe("Agenda")
      expect(agenda?.getAttribute("aria-current")).toBeNull()
      const create = Array.from(controls.querySelectorAll("button")).find(
        button => button.textContent?.trim() === "Crear solicitud"
      )
      expect(create, "Existing create action remains available").toBeDefined()
      expect(create!.disabled).toBe(false)
      orders!.click()
      await s.settle()
      expect(TestBed.inject(Router).url).toBe("/admin/operations/orders")
      if (state === "loading") expect(pending.cancelled).toBe(true)
      s.http.expectNone(() => true)
    }
  )

  it("opens the working blank agenda consumer from the inbox header without an agenda GET", async () => {
    const s = await setup()
    const pending = s.request()
    const link = s.element.querySelector<HTMLAnchorElement>(
      '[catalogControls] a[href="/admin/operations/agenda"]'
    )!
    expect(link).not.toBeNull()
    link.click()
    await s.settle()
    expect(pending.cancelled).toBe(true)
    expect(TestBed.inject(Router).url).toBe("/admin/operations/agenda")
    expect(
      s.harness.routeNativeElement!.querySelector<HTMLInputElement>("#agenda-date")?.value
    ).toBe("")
    s.http.expectNone(r => r.url.includes("/api/"))
  })

  it("starts with one 0/20 GET, observable loading and actual ordered table/card records", async () => {
    const s = await setup()
    const pending = s.request()
    expect(s.element.textContent).toContain("Operaciones")
    expect(s.element.querySelector("h1")?.textContent).toContain("Solicitudes internas")
    expect(s.element.querySelector('[role="status"]')?.textContent).toMatch(/Cargando solicitudes/)
    expect(s.element.textContent).not.toMatch(/No hay solicitudes|0–0 de 0/)
    pending.flush(page(0, 20, 2))
    await s.settle()
    expect(s.element.querySelector("app-catalog-frame section")?.getAttribute("aria-busy")).toBe(
      "false"
    )
    expect(s.harness.routeDebugElement!.injector.get(ServiceRequestsStore)).toBe(
      TestBed.inject(ServiceRequestsStore)
    )
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const records = s.element.querySelector(selector)!
      expect(records, selector).not.toBeNull()
      expect(records.textContent).toContain("Cliente suministrado")
      expect(records.textContent).toContain("Oficina norte")
      expect(records.textContent).toContain("Limpieza profunda")
      expect(records.textContent).toMatch(/registrada/i)
      expect(records.textContent).toContain("2026-03-10")
      const links = records.querySelectorAll<HTMLAnchorElement>(`a[href^="${inbox}/"]`)
      expect(Array.from(links).map(link => link.getAttribute("href"))).toEqual([
        `${inbox}/17?page=0&size=20`,
        `${inbox}/1001?page=0&size=20`
      ])
      expect(links[0].textContent?.trim()).not.toBe("")
      expect(records.querySelector("button")).toBeNull()
    }
    expect(s.element.querySelector("[catalogDesktop] table")).not.toBeNull()
    expect(s.element.querySelectorAll("[catalogDesktop] tbody tr")).toHaveLength(2)
    expect(s.element.querySelectorAll("ul[catalogMobile] > li")).toHaveLength(2)
    expect(s.element.querySelector("input, select")).toBeNull()
    expect(s.element.textContent).not.toMatch(/Editar|Cancelar solicitud|Cotizar|KPI/)
    s.http.expectNone(() => true)
  })

  it("adopts effective metadata without another GET and carries it in links and one-based paging actions", async () => {
    const s = await setup({ url: `${inbox}?page=2&size=200` })
    s.request(2, 200).flush(page(2, 100, 201))
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.element.textContent).toContain("201–201 de 201")
    expect(
      s.element.querySelector('app-table-pagination [aria-current="page"]')?.textContent?.trim()
    ).toBe("3")
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const link = s.element.querySelector<HTMLAnchorElement>(`${selector} a`)
      expect(link?.getAttribute("href")).toBe(`${inbox}/17?page=2&size=100`)
      expect(link?.getAttribute("aria-label") || link?.textContent?.trim()).toBeTruthy()
    }
    expect(
      s.element.querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')?.disabled
    ).toBe(true)
    await s.click("Página anterior")
    s.request(1, 100).flush(page(1, 100, 201))
    await s.settle()
    await s.click("Página 3")
    s.request(2, 100).flush(page(2, 100, 201))
    await s.settle()
    s.http.expectNone(() => true)
    const link = s.element.querySelector<HTMLAnchorElement>("[catalogDesktop] a")!
    link.click()
    await s.settle()
    expect(TestBed.inject(Router).url).toBe(`${inbox}/17?page=2&size=100`)
    s.http.expectNone(() => true)
  })

  it.each(["?page=2", "?page=2&size=5&size=10", "?page=-1&size=5"])(
    "defaults malformed paired URL context %s before the first GET",
    async suffix => {
      const s = await setup({ url: `${inbox}${suffix}` })
      s.request().flush(page(0, 20, 0))
      await s.settle()
      expect(s.element.textContent).toMatch(/No hay solicitudes/)
      s.http.expectNone(() => true)
    }
  )

  it("distinguishes verified empty from safe initial error and unverified totals, with GET-only retry", async () => {
    const s = await setup()
    s.request().flush({ mensaje: "RAW INTERNAL DETAIL" }, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/permiso/i)
    expect(s.element.textContent).not.toMatch(/No hay solicitudes|RAW INTERNAL DETAIL|0–0 de 0/)
    expect(s.element.textContent).toMatch(/sin verificar/i)
    await s.click("Reintentar")
    s.request().flush(page(0, 20, 0))
    await s.settle()
    expect(s.element.textContent).toMatch(/No hay solicitudes/)
    expect(s.element.textContent).toContain("0–0 de 0")
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
    s.http.expectNone(() => true)
  })

  it("keeps only same-query stale records on expired revisit, error and forced retry", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    s.request().flush(page())
    await s.settle()
    await s.click("Página siguiente")
    expect(s.element.textContent).not.toContain("Cliente suministrado")
    s.request(1).flush(page(1, 20, 45, dto(18, "Otra página")))
    await s.settle()
    clock.mockReturnValue(31000)
    await s.click("Página anterior")
    const refresh = s.request()
    expect(s.element.textContent).toContain("Cliente suministrado")
    expect(s.element.textContent).not.toContain("Otra página")
    expect(s.element.textContent).toMatch(/Actualizando solicitudes/)
    refresh.error(new ProgressEvent("error"))
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/desactualizados/i)
    expect(s.element.textContent).toContain("Cliente suministrado")
    await s.click("Reintentar")
    const retry = s.request()
    expect(s.element.textContent).toContain("Cliente suministrado")
    retry.flush(page())
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("bounds positive-total out-of-range recovery to one correction per navigation or retry", async () => {
    const s = await setup({ url: `${inbox}?page=3&size=20` })
    s.request(3).flush(page(3, 20, 45))
    await s.settle()
    // Both empty pages are valid out-of-range responses; page zero is never falsely empty.
    s.request(2).flush(page(2, 20, 1))
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.element.textContent).toMatch(/Esta página ya no tiene registros/)
    expect(s.element.textContent).not.toMatch(/No hay solicitudes/)
    expect(
      TestBed.inject(ServiceRequestsStore).selectRequests({ offset: 60, limit: 20 }).result
    ).toMatchObject({ offset: 60, limit: 20, total: 45, items: [] })
    await s.click("Reintentar")
    s.request(2).flush(page(2, 20, 1))
    await s.settle()
    s.request().flush(page(0, 20, 1))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("supersedes queued recovery through public router navigation, without a late GET", async () => {
    const s = await setup({ url: `${inbox}?page=3&size=20` })
    const pending = s.request(3)
    // Hold only the response turn's microtasks so public navigation deterministically
    // supersedes recovery, rather than racing the router's own async scheduling.
    const queued: VoidFunction[] = []
    const scheduler = vi
      .spyOn(globalThis, "queueMicrotask")
      .mockImplementation(task => queued.push(task))
    try {
      pending.flush(page(3, 20, 45))
    } finally {
      scheduler.mockRestore()
    }
    await TestBed.inject(Router).navigateByUrl("/elsewhere")
    queued.forEach(task => task())
    await s.settle()
    s.http.expectNone(() => true)
    expect(TestBed.inject(Router).url).toBe("/elsewhere")
    await TestBed.inject(Router).navigateByUrl(`${inbox}?page=0&size=5`)
    await s.settle()
    s.request(0, 5).flush(page(0, 5, 0))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it.each(["destroy", "logout"] as const)(
    "fences queued recovery on %s without late work",
    async action => {
      const s = await setup({ url: `${inbox}?page=3&size=20` })
      s.request(3).flush(page(3, 20, 45))
      if (action === "destroy") s.harness.fixture.destroy()
      else s.session.next(null)
      await Promise.resolve()
      if (action === "logout") await s.settle()
      s.http.expectNone(() => true)
      const result = TestBed.inject(ServiceRequestsStore).selectRequests({
        offset: 60,
        limit: 20
      }).result
      if (action === "destroy")
        expect(result).toMatchObject({ offset: 60, limit: 20, total: 45, items: [] })
      else {
        expect(result).toBeUndefined()
        expect(s.element.querySelector("[catalogDesktop], [catalogMobile]")).toBeNull()
      }
    }
  )

  it("releases only the destroyed page's subscription while another root consumer keeps its read and result", async () => {
    const s = await setup()
    const pending = s.request()
    const store = TestBed.inject(ServiceRequestsStore)
    const other = store.observeRequests({ offset: 0, limit: 20 }).subscribe()
    subscriptions.push(other)
    s.harness.fixture.destroy()
    expect(pending.cancelled).toBe(false)
    pending.flush(page(0, 20, 1))
    expect(store.selectRequests().result?.items[0].customerId).toBe(88)
    expect(store.selectRequests().result?.items[0].customerName).toBe("Cliente suministrado")
    other.unsubscribe()
    s.http.expectNone(() => true)
  })

  it("cancels its final pending read on destruction with no late work or fabricated result", async () => {
    const s = await setup()
    const pending = s.request()
    s.harness.fixture.destroy()
    expect(pending.cancelled).toBe(true)
    await Promise.resolve()
    s.http.expectNone(() => true)
    expect(TestBed.inject(ServiceRequestsStore).selectRequests().result).toBeUndefined()
  })

  it("preserves work on same-session renewal and cancels old work on session replacement", async () => {
    const s = await setup()
    const old = s.request()
    s.session.next(caller(19, deadline, "Renewed caller"))
    await s.settle()
    expect(old.cancelled).toBe(false)
    s.http.expectNone(() => true)
    old.flush(page(0, 20, 21))
    await s.settle()
    await s.click("Página siguiente")
    const obsolete = s.request(1)
    s.session.next(caller(20, deadline + 1, "Replacement"))
    await s.settle()
    expect(obsolete.cancelled).toBe(true)
    expect(s.element.textContent).not.toContain("Cliente suministrado")
    s.request().flush(page(0, 20, 1, dto(27, "Cliente de reemplazo")))
    await s.settle()
    expect(s.element.textContent).toContain("Cliente de reemplazo")
    expect(
      TestBed.inject(ServiceRequestsStore).selectRequests({ offset: 20, limit: 20 }).result
    ).toBeUndefined()
    s.http.expectNone(() => true)
  })

  it.each([{ server: true }, { guest: true }])(
    "dispatches no HTTP for SSR/guest %j",
    async options => {
      const s = await setup(options)
      s.http.expectNone(() => true)
      expect(s.element.querySelector("[catalogDesktop], [catalogMobile]")).toBeNull()
      expect(s.element.textContent).not.toMatch(/No hay solicitudes|0–0 de 0/)
    }
  )

  it("renders supplied names as plain text and nullable desired dates without lookups", async () => {
    const s = await setup()
    const response = page(0, 20, 1, dto(17, "<b>Cliente literal</b>"))
    s.request().flush({
      ...response,
      contenido: [{ ...response.contenido[0], fechaDeseada: null }]
    })
    await s.settle()
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const records = s.element.querySelector(selector)!
      expect(records.textContent).toContain("<b>Cliente literal</b>")
      expect(records.textContent).toContain("No registrado")
      expect(records.querySelector("b")).toBeNull()
    }
    s.http.expectNone(() => true)
  })
})
