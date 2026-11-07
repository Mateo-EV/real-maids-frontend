import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, Subscription } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideOperationsRequestReads } from "../../../operations.providers"
import { ServiceOrdersStore } from "../../state/service-orders.store"
import { ServiceOrdersPage } from "./service-orders-page"
import { orderDto, ordersDtoPage } from "./service-orders-page.testing"

const api = "https://api.example.test/api/ordenes"
const inbox = "/admin/operations/orders"
const deadline = 4102444800000
const caller = (id = 19, expires = deadline, name = "Caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, expires, id)

@Component({ template: "<p>Future destination</p>" })
class NavigationTarget {}

const subscriptions: Subscription[] = []
async function setup(options: { url?: string; server?: boolean; guest?: boolean } = {}) {
  const session = new BehaviorSubject<AuthSession | null>(options.guest ? null : caller())
  const authCreated = vi.fn(() => ({ session: () => session.value }))
  const observeSession = vi.fn(() => session.asObservable())
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideOperationsRequestReads(),
      // Deliberately no component/route toast provider: this leaf does not use feedback.
      provideRouter([
        { path: "admin/operations/orders", component: ServiceOrdersPage },
        { path: "admin/operations/orders/:id", component: NavigationTarget },
        { path: "admin/operations/requests", component: NavigationTarget },
        { path: "elsewhere", component: NavigationTarget }
      ]),
      { provide: API_URL, useValue: "https://api.example.test" },
      { provide: AuthStore, useFactory: authCreated },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: observeSession } },
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
  // Missing behavior fails here synchronously; no polling/waitFor/timeouts.
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
  return { harness, element, http, request, settle, click, session, authCreated, observeSession }
}

afterEach(() => {
  try {
    subscriptions.splice(0).forEach(subscription => subscription.unsubscribe())
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

// T6D / S1,S3,S4,S5,S6: public unrouted leaf contracts, not root integration.
// The typed RED scaffold intentionally has no observation, retry or page action.
describe("ServiceOrdersPage read-only inbox", () => {
  // T6F / S1,S3,S4,S5,S6,S8: preserve paging and read-only controls.
  it.each(["loading", "empty", "error"] as const)(
    "exposes working Solicitudes/Órdenes links in CatalogFrame controls during %s",
    async state => {
      const s = await setup({ url: `${inbox}?page=2&size=5` })
      const pending = s.request(2, 5)
      if (state === "empty") pending.flush(ordersDtoPage(2, 5, 0))
      else if (state === "error") pending.error(new ProgressEvent("error"))
      await s.settle()
      const controls = s.element.querySelector("app-catalog-frame header [catalogControls]")!
      expect(controls, "CatalogFrame header controls").not.toBeNull()
      const requests = controls.querySelector<HTMLAnchorElement>(
        'a[href="/admin/operations/requests"]'
      )
      const orders = controls.querySelector<HTMLAnchorElement>(`a[href="${inbox}"]`)
      expect(requests?.textContent?.trim()).toBe("Solicitudes")
      expect(requests?.getAttribute("aria-current")).toBeNull()
      expect(orders?.textContent?.trim()).toBe("Órdenes")
      expect(orders?.getAttribute("aria-current")).toBe("page")
      expect(controls.querySelector('a[href*="agenda"], button')).toBeNull()
      requests!.click()
      await s.settle()
      expect(TestBed.inject(Router).url).toBe("/admin/operations/requests")
      if (state === "loading") expect(pending.cancelled).toBe(true)
      s.http.expectNone(() => true)
    }
  )

  it("starts one 0/20 GET, announces loading and renders actual server order in table and cards", async () => {
    const s = await setup()
    const pending = s.request()
    expect(s.element.querySelector("h1")?.textContent).toContain("Órdenes de servicio")
    expect(s.element.textContent).toContain("Operaciones")
    expect(s.element.textContent).toMatch(/Cargando órdenes/)
    expect(s.element.querySelector("app-catalog-frame section")?.getAttribute("aria-busy")).toBe(
      "true"
    )
    expect(s.element.textContent).not.toMatch(/No hay órdenes|0–0 de 0/)
    const first = orderDto(27)
    const response = ordersDtoPage(0, 20, 2, first)
    response.contenido[1] = orderDto(3, "Segundo cliente")
    pending.flush(response)
    await s.settle()
    expect(s.harness.routeDebugElement!.injector.get(ServiceOrdersStore)).toBe(
      TestBed.inject(ServiceOrdersStore)
    )
    expect(s.element.querySelector("app-catalog-frame section")?.getAttribute("aria-busy")).toBe(
      "false"
    )
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const records = s.element.querySelector(selector)!
      expect(records, selector).not.toBeNull()
      for (const text of [
        "Cliente suministrado",
        "Oficina norte",
        "Limpieza profunda",
        "Estado suministrado"
      ])
        expect(records.textContent).toContain(text)
      const links = Array.from(records.querySelectorAll<HTMLAnchorElement>(`a[href^="${inbox}/"]`))
      expect(links.map(link => link.getAttribute("href"))).toEqual([
        `${inbox}/27?page=0&size=20`,
        `${inbox}/3?page=0&size=20`
      ])
      expect(links[0].textContent).toContain("OS-27")
      expect(links[0].getAttribute("aria-label") || links[0].textContent).toContain("OS-27")
      expect(records.querySelector("button")).toBeNull()
    }
    expect(s.element.querySelectorAll("[catalogDesktop] tbody tr")).toHaveLength(2)
    expect(s.element.querySelectorAll("ul[catalogMobile] > li")).toHaveLength(2)
    expect(s.element.querySelector("[catalogDesktop] table caption")).not.toBeNull()
    expect(s.element.querySelector("input, select, textarea, [catalogControls] button")).toBeNull()
    expect(s.element.textContent).not.toMatch(/Crear orden|Editar|Asignar|Cancelar orden|KPI/)
    s.http.expectNone(() => true)
  })

  it("uses returned effective paging for ranges, links and navigation without a duplicate GET", async () => {
    const s = await setup({ url: `${inbox}?page=2&size=200` })
    s.request(2, 200).flush(ordersDtoPage(2, 100, 201))
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.element.textContent).toContain("201–201 de 201")
    expect(
      s.element.querySelector('app-table-pagination [aria-current="page"]')?.textContent?.trim()
    ).toBe("3")
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"])
      expect(s.element.querySelector(`${selector} a`)?.getAttribute("href")).toBe(
        `${inbox}/17?page=2&size=100`
      )
    expect(
      s.element.querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')?.disabled
    ).toBe(true)
    await s.click("Página anterior")
    s.request(1, 100).flush(ordersDtoPage(1, 100, 201))
    await s.settle()
    await s.click("Página 3")
    s.request(2, 100).flush(ordersDtoPage(2, 100, 201))
    await s.settle()
    s.http.expectNone(() => true)
    s.element.querySelector<HTMLAnchorElement>("[catalogDesktop] a")!.click()
    await s.settle()
    expect(TestBed.inject(Router).url).toBe(`${inbox}/17?page=2&size=100`)
    s.http.expectNone(() => true)
  })

  it.each(["?page=2", "?page=2&size=5&size=10", "?page=2147483648&size=1"])(
    "defaults malformed paired numeric context %s before its initial GET",
    async suffix => {
      const s = await setup({ url: `${inbox}${suffix}` })
      s.request().flush(ordersDtoPage(0, 20, 0))
      await s.settle()
      expect(s.element.textContent).toMatch(/No hay órdenes/)
      s.http.expectNone(() => true)
    }
  )

  it("keeps initial errors unverified and safe, then explicitly retries GET to verified zero", async () => {
    const s = await setup()
    s.request().flush({ mensaje: "RAW INTERNAL DETAIL" }, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/permiso/i)
    expect(s.element.textContent).toMatch(/sin verificar/i)
    expect(s.element.textContent).not.toMatch(/No hay órdenes|RAW INTERNAL DETAIL|0–0 de 0/)
    await s.click("Reintentar")
    s.request().flush(ordersDtoPage(0, 20, 0))
    await s.settle()
    expect(s.element.textContent).toMatch(/No hay órdenes/)
    expect(s.element.textContent).toContain("0–0 de 0")
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
    s.http.expectNone(() => true)
  })

  it("preserves only the same query's verified rows during expired revisit, refresh error and forced retry", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    s.request().flush(ordersDtoPage())
    await s.settle()
    await s.click("Página siguiente")
    expect(s.element.textContent).not.toContain("Cliente suministrado")
    s.request(1).flush({ mensaje: "PRIVATE" }, { status: 500, statusText: "Failure" })
    await s.settle()
    expect(s.element.textContent).not.toContain("Cliente suministrado")
    await s.click("Reintentar")
    s.request(1).flush(ordersDtoPage(1, 20, 45, orderDto(18, "Otra página")))
    await s.settle()
    clock.mockReturnValue(31000)
    await s.click("Página anterior")
    const refresh = s.request()
    expect(s.element.textContent).toContain("Cliente suministrado")
    expect(s.element.textContent).not.toContain("Otra página")
    expect(s.element.textContent).toMatch(/Actualizando órdenes/)
    refresh.error(new ProgressEvent("error"))
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/desactualizados/i)
    expect(s.element.textContent).toContain("Cliente suministrado")
    await s.click("Reintentar")
    const retry = s.request()
    expect(s.element.textContent).toContain("Cliente suministrado")
    retry.flush(ordersDtoPage())
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("retains verified empty/zero during a shared root refresh and error, without fabricating unverified totals", async () => {
    const s = await setup()
    s.request().flush(ordersDtoPage(0, 20, 0))
    await s.settle()
    const root = TestBed.inject(ServiceOrdersStore)
    subscriptions.push(root.observeOrders({}, true).subscribe())
    const refresh = s.request()
    await s.settle()
    expect(s.element.textContent).toMatch(/Actualizando órdenes/)
    expect(s.element.textContent).toContain("0–0 de 0")
    refresh.error(new ProgressEvent("error"))
    await s.settle()
    expect(s.element.textContent).toContain("0–0 de 0")
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/desactualizados/i)
    s.http.expectNone(() => true)
  })

  it("makes only one positive-total recovery per navigation/retry and retains the effective size", async () => {
    const s = await setup({ url: `${inbox}?page=3&size=200` })
    s.request(3, 200).flush(ordersDtoPage(3, 100, 201))
    await s.settle()
    s.request(2, 100).flush(ordersDtoPage(2, 100, 1))
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.element.textContent).toMatch(/Esta página ya no tiene registros/)
    expect(s.element.textContent).not.toMatch(/No hay órdenes/)
    expect(
      TestBed.inject(ServiceOrdersStore).selectOrders({ offset: 600, limit: 200 }).result
    ).toMatchObject({ offset: 300, limit: 100, total: 201, items: [] })
    await s.click("Reintentar")
    s.request(2, 100).flush(ordersDtoPage(2, 100, 1))
    await s.settle()
    s.request(0, 100).flush(ordersDtoPage(0, 100, 1))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("never corrects an empty page whose server total is zero", async () => {
    const s = await setup({ url: `${inbox}?page=3&size=20` })
    s.request(3).flush(ordersDtoPage(3, 20, 0))
    await s.settle()
    expect(s.element.textContent).toMatch(/No hay órdenes/)
    expect(s.element.textContent).toContain("0–0 de 0")
    s.http.expectNone(() => true)
  })

  it.each(["away", "destroy", "logout"] as const)(
    "fences queued corrective GET after %s",
    async action => {
      const s = await setup({ url: `${inbox}?page=3&size=20` })
      const pending = s.request(3)
      const queued: VoidFunction[] = []
      const scheduler = vi
        .spyOn(globalThis, "queueMicrotask")
        .mockImplementation(task => queued.push(task))
      try {
        pending.flush(ordersDtoPage(3, 20, 45))
      } finally {
        scheduler.mockRestore()
      }
      if (action === "away") await TestBed.inject(Router).navigateByUrl("/elsewhere")
      else if (action === "destroy") s.harness.fixture.destroy()
      else s.session.next(null)
      queued.forEach(task => task())
      if (action !== "destroy") await s.settle()
      s.http.expectNone(() => true)
      if (action === "logout") {
        expect(
          TestBed.inject(ServiceOrdersStore).selectOrders({ offset: 60, limit: 20 }).result
        ).toBeUndefined()
        expect(s.element.querySelector("[catalogDesktop], [catalogMobile]")).toBeNull()
      }
    }
  )

  it("fences old queued recovery on session replacement while admitting only the new session's initial page", async () => {
    const s = await setup({ url: `${inbox}?page=3&size=20` })
    const pending = s.request(3)
    const queued: VoidFunction[] = []
    const scheduler = vi
      .spyOn(globalThis, "queueMicrotask")
      .mockImplementation(task => queued.push(task))
    try {
      pending.flush(ordersDtoPage(3, 20, 45))
    } finally {
      scheduler.mockRestore()
    }
    s.session.next(caller(20, deadline + 1))
    queued.forEach(task => task())
    await s.settle()
    s.request().flush(ordersDtoPage(0, 20, 1, orderDto(39, "Propietario nuevo")))
    await s.settle()
    expect(s.element.textContent).toContain("Propietario nuevo")
    expect(
      TestBed.inject(ServiceOrdersStore).selectOrders({ offset: 60, limit: 20 }).result
    ).toBeUndefined()
    s.http.expectNone(() => true)
  })

  it("releases only its observer when another root consumer still owns the same pending GET", async () => {
    const s = await setup()
    const pending = s.request()
    const store = TestBed.inject(ServiceOrdersStore)
    const other = store.observeOrders({ offset: 0, limit: 20 }).subscribe()
    subscriptions.push(other)
    s.http.expectNone(() => true)
    s.harness.fixture.destroy()
    expect(pending.cancelled).toBe(false)
    pending.flush(ordersDtoPage(0, 20, 1))
    expect(store.selectOrders().result?.items[0].code).toBe("OS-17")
    expect(store.selectOrders().result?.items[0].customerName).toBe("Cliente suministrado")
    other.unsubscribe()
    s.http.expectNone(() => true)
  })

  it("cancels its final pending GET on destruction without fabricated data or late work", async () => {
    const s = await setup()
    const pending = s.request()
    s.harness.fixture.destroy()
    expect(pending.cancelled).toBe(true)
    await Promise.resolve()
    expect(TestBed.inject(ServiceOrdersStore).selectOrders().result).toBeUndefined()
    s.http.expectNone(() => true)
  })

  it("releases a superseded page query's pending GET through public pagination", async () => {
    const s = await setup()
    s.request().flush(ordersDtoPage())
    await s.settle()
    const store = TestBed.inject(ServiceOrdersStore)
    const external = store.observeOrders({}, true).subscribe()
    const refresh = s.request()
    await s.settle()
    external.unsubscribe()
    await s.click("Página siguiente")
    expect(refresh.cancelled).toBe(true)
    expect(s.element.textContent).not.toContain("Cliente suministrado")
    s.request(1).flush(ordersDtoPage(1, 20, 45, orderDto(29, "Nuevo contexto")))
    await s.settle()
    expect(s.element.textContent).toContain("Nuevo contexto")
    s.http.expectNone(() => true)
  })

  it("keeps same-session renewal work but cancels and clears old queries on replacement", async () => {
    const s = await setup()
    const old = s.request()
    s.session.next(caller(19, deadline, "Renewed name"))
    await s.settle()
    expect(old.cancelled).toBe(false)
    s.http.expectNone(() => true)
    old.flush(ordersDtoPage(0, 20, 21))
    await s.settle()
    await s.click("Página siguiente")
    const obsolete = s.request(1)
    s.session.next(caller(20, deadline + 1, "Replacement"))
    await s.settle()
    expect(obsolete.cancelled).toBe(true)
    expect(s.element.textContent).not.toContain("Cliente suministrado")
    s.request().flush(ordersDtoPage(0, 20, 1, orderDto(27, "Cliente nuevo")))
    await s.settle()
    expect(s.element.textContent).toContain("Cliente nuevo")
    expect(
      TestBed.inject(ServiceOrdersStore).selectOrders({ offset: 20, limit: 20 }).result
    ).toBeUndefined()
    s.http.expectNone(() => true)
  })

  it("dispatches no SSR HTTP and never initializes auth or session observation", async () => {
    const s = await setup({ server: true })
    s.http.expectNone(() => true)
    expect(s.authCreated).not.toHaveBeenCalled()
    expect(s.observeSession).not.toHaveBeenCalled()
    expect(s.element.querySelector("[catalogDesktop], [catalogMobile]")).toBeNull()
    expect(s.element.textContent).not.toMatch(/No hay órdenes|0–0 de 0/)
  })

  it("dispatches no guest reads or verified rows/totals", async () => {
    const s = await setup({ guest: true })
    s.http.expectNone(() => true)
    expect(s.element.querySelector("[catalogDesktop], [catalogMobile]")).toBeNull()
    expect(s.element.textContent).not.toMatch(/No hay órdenes|0–0 de 0/)
  })

  it("renders literal supplied names, calendar/nanosecond clocks and decimal text without currency or lookups", async () => {
    const s = await setup()
    s.request().flush(ordersDtoPage(0, 20, 1, orderDto(17, "<b>Cliente literal</b>")))
    await s.settle()
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const records = s.element.querySelector(selector)!
      for (const value of [
        "<b>Cliente literal</b>",
        "Estado suministrado",
        "2024-02-29",
        "08:15:00.123456789",
        "09:45:00.987654321",
        "1234.50"
      ])
        expect(records.textContent).toContain(value)
      expect(records.querySelector("b")).toBeNull()
      expect(records.textContent).not.toMatch(
        /USD|EUR|\$|UTC-[0-9]|Instrucciones de acceso|Código de puerta/
      )
    }
    s.http.expectNone(() => true)
  })

  it("distinguishes absent schedule/amount from zero without default schedules or inferred request IDs", async () => {
    const s = await setup()
    const base = orderDto()
    s.request().flush({
      ...ordersDtoPage(0, 20, 2),
      contenido: [
        { ...base, montoEstimado: null, programacion: null, idSolicitud: null },
        { ...orderDto(18), montoEstimado: 0, programacion: null }
      ]
    })
    await s.settle()
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const records = s.element.querySelector(selector)!
      expect(records.textContent).toMatch(/No registrado|Sin programación/)
      expect(records.textContent).toContain("0.00")
      expect(records.textContent).not.toContain("08:15")
      expect(records.textContent).not.toMatch(/Solicitud #0|USD|\$/)
    }
    s.http.expectNone(() => true)
  })
})
