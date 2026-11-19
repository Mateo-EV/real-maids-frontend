import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject } from "rxjs"
import { afterEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideRouter } from "@angular/router"
import { provideDashboardReads } from "../../../dashboard.providers"
import { DashboardPage } from "./dashboard-page"

const endpoint = "https://api.example.test/api/dashboard"
const deadline = 4102444800000
const caller = (id = 19, expires = deadline) =>
  AuthSession.create("Caller", `caller${id}@example.test`, null, expires, id)

/** The documented `DashboardResponse` shape the page consumes. */
const wire = () => ({
  generadoEn: "2026-02-11T09:15:00-05:00",
  actual: {
    ordenesPorEstado: { PENDIENTE: 2, PROGRAMADA: 5 },
    serviciosHoy: 6,
    serviciosProximos7Dias: 21,
    ordenesSinProgramar: 4,
    solicitudesPorAtender: 3,
    atencionesAbiertas: 1,
    serviciosPorDia: [
      { fecha: "2026-02-10", servicios: 4 },
      { fecha: "2026-02-11", servicios: 6 }
    ],
    cargaProximos7Dias: [{ idPersonal: 7, nombre: "Ana Torres", servicios: 11, horas: 38.5 }]
  },
  periodo: {
    desde: "2026-01-12",
    hasta: "2026-02-11",
    solicitudesRegistradas: 24,
    ordenesCreadas: 19,
    ordenesCompletadas: 17,
    ordenesCanceladas: 2,
    tasaCumplimiento: 89.47,
    montoCompletado: 12500.5,
    quejas: 1
  }
})

/** A window with no activity: verified zeros, not "no data". */
const zeroWire = () => ({
  generadoEn: "2026-02-11T09:15:00-05:00",
  actual: {
    ordenesPorEstado: {},
    serviciosHoy: 0,
    serviciosProximos7Dias: 0,
    ordenesSinProgramar: 0,
    solicitudesPorAtender: 0,
    atencionesAbiertas: 0,
    serviciosPorDia: [],
    cargaProximos7Dias: []
  },
  periodo: {
    desde: "2026-01-12",
    hasta: "2026-02-11",
    solicitudesRegistradas: 0,
    ordenesCreadas: 0,
    ordenesCompletadas: 0,
    ordenesCanceladas: 0,
    tasaCumplimiento: null,
    montoCompletado: 0,
    quejas: 0
  }
})

async function setup(options: { server?: boolean; guest?: boolean } = {}) {
  const session = new BehaviorSubject<AuthSession | null>(options.guest ? null : caller())
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideDashboardReads(),
      provideRouter([{ path: "dashboard", component: DashboardPage }]),
      { provide: API_URL, useValue: "https://api.example.test" },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } }
    ]
  })
  const harness = await RouterTestingHarness.create("/dashboard")
  const http = TestBed.inject(HttpTestingController)
  const element = harness.routeNativeElement!
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const input = (id: string) =>
    element.querySelector<HTMLInputElement>(`input#${id}`) as HTMLInputElement | null
  const field = async (id: string, value: string) => {
    const control = input(id)
    expect(control, `Missing labeled control ${id}`).not.toBeNull()
    control!.value = value
    control!.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
  }
  const click = async (label: string) => {
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    expect(button!.disabled, label).toBe(false)
    button!.click()
    await settle()
  }
  const kpi = (key: string) =>
    element.querySelector(`[data-kpi="${key}"]`)?.textContent?.trim() ?? ""
  const statuses = () =>
    Array.from(element.querySelectorAll<HTMLElement>('[role="status"]')).map(
      node => node.textContent?.trim() ?? ""
    )
  const alertText = () => element.querySelector('[role="alert"]')?.textContent ?? ""
  const request = () => {
    const pending = http.expectOne(candidate => candidate.url === endpoint)
    expect(pending.request.method).toBe("GET")
    expect(pending.request.transferCache).toBe(false)
    return pending
  }
  return {
    harness,
    element,
    http,
    settle,
    input,
    field,
    click,
    kpi,
    statuses,
    alertText,
    request,
    page: () => harness.routeDebugElement!.injector.get(DashboardPage)
  }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    TestBed.resetTestingModule()
  }
})

// W4 / S2,S6: one entry, one read; nothing is replayed or polled.
describe("DashboardPage read ownership", () => {
  it("reads exactly once on entry and never re-subscribes on change detection", async () => {
    const page = await setup()
    const entries = page.http.match(candidate => candidate.url === endpoint)
    expect(entries, "one mount read").toHaveLength(1)
    expect(entries[0].request.params.keys()).toEqual([])
    entries[0].flush(wire())
    await page.settle()

    expect(page.element.textContent).toContain("Situación actual")
    // Repeated change detection renders the verified board from the store entry instead of
    // opening another subscription, so no further read exists.
    page.harness.detectChanges()
    page.harness.detectChanges()
    await page.settle()
    page.http.expectNone(() => true)
  })

  it("performs exactly one more read per accepted window change", async () => {
    const page = await setup()
    page.request().flush(wire())
    await page.settle()

    await page.field("dashboard-from", "2026-01-01")
    const first = page.http.match(candidate => candidate.url === endpoint)
    expect(first, "one read for the new window").toHaveLength(1)
    expect(first[0].request.params.get("desde")).toBe("2026-01-01")
    expect(first[0].request.params.get("hasta")).toBeNull()
    first[0].flush(wire())
    await page.settle()

    await page.field("dashboard-to", "2026-01-31")
    const second = page.http.match(candidate => candidate.url === endpoint)
    expect(second, "one read for the completed window").toHaveLength(1)
    expect(second[0].request.params.keys().sort()).toEqual(["desde", "hasta"])
    expect(second[0].request.params.get("desde")).toBe("2026-01-01")
    expect(second[0].request.params.get("hasta")).toBe("2026-01-31")
    second[0].flush(wire())
    await page.settle()

    page.http.expectNone(() => true)
  })
})

// W4 / S7: supplied figures are printed as text, never recomputed, rounded or re-scaled.
describe("DashboardPage verified board", () => {
  it("prints the supplied counts, amount and rate exactly, without client arithmetic", async () => {
    const page = await setup()
    page.request().flush(wire())
    await page.settle()

    expect(page.kpi("services-today")).toBe("6")
    expect(page.kpi("services-next-7")).toBe("21")
    expect(page.kpi("unscheduled-orders")).toBe("4")
    expect(page.kpi("requests-pending")).toBe("3")
    expect(page.kpi("open-support")).toBe("1")
    expect(page.kpi("requests-registered")).toBe("24")
    expect(page.kpi("orders-created")).toBe("19")
    expect(page.kpi("orders-completed")).toBe("17")
    expect(page.kpi("orders-cancelled")).toBe("2")
    expect(page.kpi("complaints")).toBe("1")
    // `BigDecimal` and the rate keep the supplied canonical text: no grouping, no rounding
    // and no percentage conversion is applied by this page.
    expect(page.kpi("completed-amount")).toBe("12500.5")
    expect(page.kpi("compliance-rate")).toBe("89.47")
    expect(page.kpi("compliance-rate")).not.toContain("%")
    expect(page.element.textContent).not.toContain("12.500")
    expect(page.element.textContent).not.toContain("89,47")

    // Only the reported order states are listed, with their supplied totals.
    const states = Array.from(page.element.querySelectorAll<HTMLElement>("[data-order-state]"))
    expect(states.map(node => node.getAttribute("data-order-state"))).toEqual([
      "PENDIENTE",
      "PROGRAMADA"
    ])
    expect(states.map(node => node.querySelector("th")?.textContent?.trim())).toEqual([
      "PENDIENTE",
      "PROGRAMADA"
    ])
    expect(states.map(node => node.querySelector("td")?.textContent?.trim())).toEqual(["2", "5"])
    expect(page.element.querySelector('[data-order-state="COMPLETADA"]')).toBeNull()

    // Both supplied series are rendered as markup, in the received order.
    const days = Array.from(page.element.querySelectorAll<HTMLElement>("[data-daily-date]"))
    expect(days.map(node => node.getAttribute("data-daily-date"))).toEqual([
      "2026-02-10",
      "2026-02-11"
    ])
    expect(days[1].querySelector("th")?.textContent?.trim()).toBe("2026-02-11")
    expect(days[1].querySelector("td")?.textContent?.trim()).toBe("6")
    const load = page.element.querySelector('[data-collaborator="7"]')
    expect(load?.querySelector("th")?.textContent?.trim()).toBe("Ana Torres")
    expect(Array.from(load!.querySelectorAll("td")).map(cell => cell.textContent?.trim())).toEqual([
      "11",
      "38.5"
    ])
    // Semantics: real headings and table columns for assistive technology.
    expect(page.element.querySelector("h1#dashboard-title")?.textContent?.trim()).toBe(
      "Panel operativo"
    )
    expect(page.element.querySelectorAll("h2").length).toBeGreaterThanOrEqual(4)
    const captions = Array.from(page.element.querySelectorAll("caption")).map(node =>
      node.textContent?.trim()
    )
    expect(captions).toContain("Servicios por día en el período devuelto")
  })

  it("renders a verified zero as zero and never as absent data", async () => {
    const page = await setup()
    page.request().flush(zeroWire())
    await page.settle()

    expect(page.kpi("services-today")).toBe("0")
    expect(page.kpi("services-next-7")).toBe("0")
    expect(page.kpi("unscheduled-orders")).toBe("0")
    expect(page.kpi("requests-pending")).toBe("0")
    expect(page.kpi("open-support")).toBe("0")
    expect(page.kpi("requests-registered")).toBe("0")
    expect(page.kpi("orders-completed")).toBe("0")
    expect(page.kpi("completed-amount")).toBe("0")
    expect(page.kpi("complaints")).toBe("0")
    // Null means the window closed nothing; it is not rewritten into a zero or a rate.
    expect(page.kpi("compliance-rate")).toBe("—")
    // The board is present with verified numbers, not an ambiguous "no data" state.
    expect(page.element.querySelector("h2#dashboard-current-title")).not.toBeNull()
    expect(page.element.querySelector('[role="alert"]')).toBeNull()
    const text = page.element.textContent?.toLowerCase() ?? ""
    expect(text).not.toContain("sin datos")
    expect(text).not.toContain("no hay datos")
    expect(text).not.toContain("solo está disponible")
  })

  it("displays the period the server returned instead of the typed one", async () => {
    const page = await setup()
    page.request().flush(wire())
    await page.settle()
    expect(page.element.querySelector("[data-period-from]")?.textContent?.trim()).toBe("2026-01-12")
    expect(page.element.querySelector("[data-period-to]")?.textContent?.trim()).toBe("2026-02-11")

    // A typed window is only a request: the label follows the returned period.
    await page.field("dashboard-from", "2026-03-01")
    expect(page.statuses()).toContain("Cargando panel operativo…")
    page.request().flush(wire())
    await page.settle()

    expect(page.element.querySelector("[data-period-from]")?.textContent?.trim()).toBe("2026-01-12")
    expect(page.element.querySelector("[data-period-to]")?.textContent?.trim()).toBe("2026-02-11")
    expect(page.element.querySelector("[data-period-from]")?.getAttribute("datetime")).toBe(
      "2026-01-12"
    )
    // The typed control keeps what the user typed; it is not rewritten into the label.
    expect(page.input("dashboard-from")?.value).toBe("2026-03-01")
  })
})

// W4 / S7,S8: loading, retryable error, in-flight refresh, verified zero and 403 differ.
describe("DashboardPage states", () => {
  it("distinguishes loading, error with retry, refreshing over the verified board and success", async () => {
    const page = await setup()
    expect(page.statuses()).toContain("Cargando panel operativo…")
    expect(page.element.querySelector("table")).toBeNull()
    expect(page.kpi("services-today")).toBe("")

    page.request().flush({ message: "boom" }, { status: 500, statusText: "Server Error" })
    await page.settle()
    expect(page.alertText()).toContain("No se pudo contactar al servidor")
    expect(page.element.querySelector("table")).toBeNull()
    expect(page.kpi("services-today")).toBe("")

    await page.click("Reintentar")
    const retry = page.request()
    expect(retry.request.params.keys()).toEqual([])
    retry.flush(wire())
    await page.settle()
    expect(page.element.querySelector('[role="alert"]')).toBeNull()
    expect(page.kpi("services-today")).toBe("6")

    // A forced refresh keeps the verified board visible while it runs.
    await page.click("Actualizar panel")
    expect(page.statuses()).toContain("Actualizando panel…")
    expect(page.kpi("services-today")).toBe("6")
    expect(page.element.querySelector("table")).not.toBeNull()
    page.request().flush(zeroWire())
    await page.settle()
    expect(page.statuses()).not.toContain("Actualizando panel…")
    expect(page.kpi("services-today")).toBe("0")
    page.http.expectNone(() => true)
  })

  it("renders a 403 as an explicit permission error, never as an empty board", async () => {
    const page = await setup()
    page.request().flush({ message: "denied" }, { status: 403, statusText: "Forbidden" })
    await page.settle()

    const alert = page.alertText()
    expect(alert).toContain("No tenés permiso para ver el panel operativo")
    expect(alert).toContain("DASHBOARD_LEER")
    // No zero-filled board stands in for a denied read.
    expect(page.element.querySelectorAll("[data-kpi]")).toHaveLength(0)
    expect(page.element.querySelector("table")).toBeNull()
    expect(page.element.textContent).not.toContain("Situación actual")
  })

  it("keeps a verified board through a failed forced refresh and retries only the read", async () => {
    const page = await setup()
    page.request().flush(wire())
    await page.settle()

    await page.click("Actualizar panel")
    page.request().flush({ message: "denied" }, { status: 403, statusText: "Forbidden" })
    await page.settle()

    // The verified board survives the failed revalidation and says so explicitly.
    expect(page.kpi("services-today")).toBe("6")
    expect(page.alertText()).toContain("El panel puede estar desactualizado.")
    expect(page.alertText()).toContain("DASHBOARD_LEER")
    await page.click("Reintentar")
    page.request().flush(zeroWire())
    await page.settle()
    expect(page.kpi("services-today")).toBe("0")
    expect(page.element.querySelector('[role="alert"]')).toBeNull()
    page.http.expectNone(() => true)
  })

  it("does not dispatch unsupported or inverted typed dates", async () => {
    const page = await setup()
    page.request().flush(wire())
    await page.settle()

    // Native date inputs cannot produce these values; a typed/pasted one is refused here.
    page.page().setDate({ id: "dashboard-from", value: "2026-02-30" })
    await page.settle()
    page.http.expectNone(candidate => candidate.url === endpoint)
    expect(page.alertText()).toContain("no es válida")
    expect(page.kpi("services-today")).toBe("6")

    page.page().setDate({ id: "dashboard-from", value: "2026-03-05" })
    const valid = page.request()
    expect(valid.request.params.get("desde")).toBe("2026-03-05")
    valid.flush(wire())
    await page.settle()
    expect(page.element.querySelector('[role="alert"]')).toBeNull()

    // An inverted pair is refused too, keeping the verified board and dispatching nothing.
    page.page().setDate({ id: "dashboard-to", value: "2026-03-01" })
    await page.settle()
    page.http.expectNone(candidate => candidate.url === endpoint)
    expect(page.alertText()).toContain("no es válida")
    expect(page.kpi("services-today")).toBe("6")
  })

  it("dispatches no read on the server or for an unauthenticated caller", async () => {
    const server = await setup({ server: true })
    server.http.expectNone(() => true)
    expect(server.element.querySelector("table")).toBeNull()
    expect(server.element.textContent).toContain("Panel sin verificar")
    TestBed.resetTestingModule()

    const guest = await setup({ guest: true })
    guest.http.expectNone(() => true)
    expect(guest.element.querySelector("table")).toBeNull()
    expect(guest.element.textContent).toContain("Panel sin verificar")
  })
})
