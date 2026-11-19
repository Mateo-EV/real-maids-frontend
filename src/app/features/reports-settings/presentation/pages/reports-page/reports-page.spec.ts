import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { HotToastService } from "@ngxpert/hot-toast"
import { BehaviorSubject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideReportsSettingsReads } from "../../../reports-settings.providers"
import { ReportsPage } from "./reports-page"

const base = "https://api.example.test"
const catalogUrl = `${base}/api/reportes`
const historyUrl = `${base}/api/reportes/generados`
const deadline = 4102444800000
const caller = () => AuthSession.create("Caller", "caller@example.test", null, deadline, 19)

/** A generation is any `/api/reportes/{tipo}` read: the catalog and the history are excluded. */
const isGeneration = (url: string) =>
  url !== catalogUrl && url !== historyUrl && url.startsWith(`${catalogUrl}/`)

/** `GET /api/reportes`: the only authoritative list of valid report types. */
const catalogWire = () => [
  { tipo: "CLIENTES", titulo: "Clientes", descripcion: "Actividad de clientes" },
  { tipo: "ORDENES", titulo: "Órdenes", descripcion: "Órdenes del período" }
]

/** `GET /api/reportes/{tipo}`: a generic table in document order. */
const tableWire = () => ({
  tipo: "CLIENTES",
  titulo: "Clientes",
  desde: "2026-01-01",
  hasta: "2026-01-31",
  generadoEn: "2026-02-11T09:15:00-05:00",
  columnas: ["Cliente", "Servicios", "Activo"],
  filas: [
    ["Ana", 3, true],
    [null, 0, false]
  ]
})

const historyItem = (id: number) => ({
  idReporte: id,
  tipo: "CLIENTES",
  formato: "JSON",
  parametros: "desde=2026-01-01",
  usuario: "Caller",
  fechaGeneracion: "2026-02-11T09:15:00-05:00"
})

/** The documented paged envelope; the item count must match the server arithmetic. */
const historyWire = (options: { page?: number; size?: number; total?: number } = {}) => {
  const page = options.page ?? 0
  const size = options.size ?? 20
  const total = options.total ?? 1
  const count = Math.max(0, Math.min(size, total - page * size))
  return {
    contenido: Array.from({ length: count }, (_, index) => historyItem(page * size + index + 1)),
    pagina: page,
    tamanio: size,
    totalElementos: total,
    totalPaginas: Math.ceil(total / size)
  }
}

async function setup(options: { server?: boolean } = {}) {
  const session = new BehaviorSubject<AuthSession | null>(caller())
  const success = vi.fn()
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideReportsSettingsReads(),
      provideRouter([{ path: "reports", component: ReportsPage }]),
      { provide: API_URL, useValue: base },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
      { provide: HotToastService, useValue: { success } }
    ]
  })
  const harness = await RouterTestingHarness.create("/reports")
  const http = TestBed.inject(HttpTestingController)
  const element = harness.routeNativeElement!
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  // `expectOne` fails when there is more than one candidate, so it also proves "exactly one".
  const pending = (url: string) => http.expectOne(request => request.url === url)
  const catalog = () => pending(catalogUrl)
  const history = () => pending(historyUrl)
  const generation = (type = "CLIENTES") => {
    const request = pending(`${catalogUrl}/${type}`)
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    return request
  }
  const noGeneration = () => http.expectNone(request => isGeneration(request.url))
  const click = async (label: string) => {
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
    return button!
  }
  const select = async (value: string) => {
    const control = element.querySelector<HTMLSelectElement>("select#report-type")
    expect(control, "Missing type select").not.toBeNull()
    control!.value = value
    control!.dispatchEvent(new Event("change", { bubbles: true }))
    await settle()
  }
  const date = async (id: string, value: string) => {
    const control = element.querySelector<HTMLInputElement>(`input#${id}`)
    expect(control, `Missing ${id}`).not.toBeNull()
    control!.value = value
    control!.dispatchEvent(new Event("input", { bubbles: true }))
    await settle()
  }
  const alertText = () => element.querySelector('[role="alert"]')?.textContent ?? ""
  const range = () => element.querySelector("[data-history-range]")?.textContent?.trim() ?? ""
  return {
    harness,
    element,
    http,
    session,
    success,
    settle,
    catalog,
    history,
    generation,
    noGeneration,
    click,
    select,
    date,
    alertText,
    range,
    page: () => harness.routeDebugElement!.injector.get(ReportsPage)
  }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    TestBed.resetTestingModule()
  }
})

// W6 / S5: entering the screen reads; it never generates.
describe("ReportsPage entry", () => {
  it("reads the catalog and the history once on entry and generates nothing", async () => {
    const page = await setup()
    const catalog = page.catalog()
    const entryHistory = page.history()
    expect(entryHistory.request.params.get("pagina")).toBe("0")
    expect(entryHistory.request.params.get("tamanio")).toBe("20")
    page.noGeneration()

    catalog.flush(catalogWire())
    entryHistory.flush(historyWire({ total: 0 }))
    await page.settle()
    expect(page.element.textContent).toContain("Clientes")
    expect(page.element.querySelector("[data-history-empty]")).not.toBeNull()

    // Repeated change detection renders from the store instead of opening another read,
    // and no click happened, so nothing was generated.
    page.harness.detectChanges()
    page.harness.detectChanges()
    await page.settle()
    page.http.expectNone(() => true)
  })

  it("does not generate while the type or the period is being chosen", async () => {
    const page = await setup()
    page.catalog().flush(catalogWire())
    page.history().flush(historyWire())
    await page.settle()

    await page.select("CLIENTES")
    await page.date("report-from", "2026-01-01")
    await page.date("report-to", "2026-01-31")
    page.http.expectNone(() => true)
    expect(page.element.querySelector("[data-report-table]")).toBeNull()
    // A generated report is hidden while the drafted request is a different one.
    expect(page.element.querySelector<HTMLButtonElement>("[data-report-generate]")!.disabled).toBe(
      false
    )
  })

  it("dispatches nothing at all on the server", async () => {
    const page = await setup({ server: true })
    page.http.expectNone(() => true)
    expect(page.element.textContent).toContain("Reportes")
  })
})

// W6 / S5: one explicit click, one generation and one history refresh.
describe("ReportsPage explicit generation", () => {
  it("generates exactly once with the chosen type and period and refreshes the history once", async () => {
    const page = await setup()
    page.catalog().flush(catalogWire())
    page.history().flush(historyWire())
    await page.settle()

    await page.select("CLIENTES")
    await page.date("report-from", "2026-01-01")
    await page.date("report-to", "2026-01-31")
    page.noGeneration()

    await page.click("Generar")
    const created = page.http.match(request => isGeneration(request.url))
    expect(created, "one click, one generation").toHaveLength(1)
    expect(created[0].request.method).toBe("GET")
    expect(created[0].request.transferCache).toBe(false)
    expect(created[0].request.params.get("desde")).toBe("2026-01-01")
    expect(created[0].request.params.get("hasta")).toBe("2026-01-31")
    // While the generation is in flight the action is unavailable, not queued.
    expect(page.element.querySelector<HTMLButtonElement>("[data-report-generate]")!.disabled).toBe(
      true
    )
    page.page().generate()
    await page.settle()
    // The root store refuses the duplicate, so no second request exists at all.
    page.noGeneration()

    created[0].flush(tableWire())
    await page.settle()
    expect(page.element.querySelector("[data-report-table]")).not.toBeNull()
    // A confirmed generation refreshes the history exactly once so the new record appears.
    const refresh = page.history()
    expect(refresh.request.params.get("pagina")).toBe("0")
    expect(refresh.request.params.get("tamanio")).toBe("20")
    refresh.flush(historyWire({ total: 2 }))
    await page.settle()
    expect(page.success).toHaveBeenCalledOnce()
    expect(page.element.textContent).toContain("Clientes")
    page.http.expectNone(() => true)
  })

  it("reports a failed generation, reads no history and only retries on an explicit click", async () => {
    const page = await setup()
    page.catalog().flush(catalogWire())
    page.history().flush(historyWire())
    await page.settle()

    await page.select("ORDENES")
    await page.click("Generar")
    page.generation("ORDENES").flush("boom", { status: 500, statusText: "Server Error" })
    await page.settle()
    expect(page.alertText()).toContain("No se pudo contactar al servidor")
    expect(page.alertText()).toContain("Volver a generar es una acción explícita")
    // A failed generation neither reads the history nor generates again on its own.
    page.http.expectNone(() => true)
    expect(page.success).not.toHaveBeenCalled()

    // The retry is a new explicit user action, never automatic.
    await page.click("Reintentar generación")
    page.generation("ORDENES").flush({ ...tableWire(), tipo: "ORDENES", titulo: "Órdenes" })
    await page.settle()
    page.history().flush(historyWire())
    await page.settle()
    expect(page.success).toHaveBeenCalledOnce()
    page.http.expectNone(() => true)
  })

  it("surfaces a 403 as an explicit REPORTE_LEER permission error", async () => {
    const page = await setup()
    page.catalog().flush("forbidden", { status: 403, statusText: "Forbidden" })
    page.history().flush(historyWire())
    await page.settle()
    expect(page.alertText()).toContain("REPORTE_LEER")
    // A permission error is not an empty catalog: no type is offered for selection.
    const select = page.element.querySelector<HTMLSelectElement>("select#report-type")!
    expect(Array.from(select.options).map(option => option.value)).toEqual([""])
    expect(page.element.querySelector<HTMLButtonElement>("[data-report-generate]")!.disabled).toBe(
      true
    )
  })
})

// W6 / S4: supplied table cells are printed as they arrive, in document order.
describe("ReportsPage generated table", () => {
  it("renders columns and rows in document order with supplied cells including nulls", async () => {
    const page = await setup()
    page.catalog().flush(catalogWire())
    page.history().flush(historyWire())
    await page.settle()

    await page.select("CLIENTES")
    await page.click("Generar")
    page.generation("CLIENTES").flush(tableWire())
    await page.settle()

    const columns = Array.from(page.element.querySelectorAll("[data-report-column]"), node =>
      node.textContent?.trim()
    )
    expect(columns).toEqual(["Cliente", "Servicios", "Activo"])
    const rows = Array.from(page.element.querySelectorAll("[data-report-row]"), row =>
      Array.from(row.querySelectorAll("td"), cell => cell.textContent?.trim())
    )
    expect(rows).toEqual([
      ["Ana", "3", "true"],
      ["—", "0", "false"]
    ])
    const nullCell = page.element.querySelector<HTMLElement>('[data-report-cell="empty"]')!
    expect(nullCell.textContent?.trim()).toBe("—")
    expect(page.element.textContent).toContain("2026-01-01")
    expect(page.element.textContent).toContain("2026-01-31")
    page.history().flush(historyWire())
    await page.settle()
    page.http.expectNone(() => true)
  })

  it("hides a generated report as soon as the drafted type or period differs", async () => {
    const page = await setup()
    page.catalog().flush(catalogWire())
    page.history().flush(historyWire())
    await page.settle()
    await page.select("CLIENTES")
    await page.click("Generar")
    page.generation("CLIENTES").flush(tableWire())
    await page.settle()
    page.history().flush(historyWire())
    await page.settle()
    expect(page.element.querySelector("[data-report-table]")).not.toBeNull()

    // The report belongs to the type and period it was generated with, nothing else.
    await page.select("ORDENES")
    expect(page.element.querySelector("[data-report-table]")).toBeNull()
    expect(page.element.querySelector("[data-report-empty]")).not.toBeNull()
    page.http.expectNone(() => true)
  })
})

// W6 / S4: effective server metadata, one bounded recovery and a verified empty history.
describe("ReportsPage history", () => {
  it("uses effective server metadata and recovers once from an out-of-range page", async () => {
    const page = await setup()
    page.catalog().flush(catalogWire())
    page.history().flush(historyWire({ total: 42 }))
    await page.settle()
    expect(page.range()).toBe("Mostrando 1–20 de 42")
    expect(page.element.querySelector("[data-history-empty]")).toBeNull()

    await page.click("Página 3")
    const third = page.history()
    expect(third.request.params.get("pagina")).toBe("2")
    expect(third.request.params.get("tamanio")).toBe("20")
    // The server shrank to 21 records, so the requested page is past the end.
    third.flush(historyWire({ page: 2, size: 20, total: 21 }))
    await page.settle()
    expect(page.element.querySelector("[data-history-empty]")).toBeNull()

    const recovery = page.history()
    expect(recovery.request.params.get("pagina")).toBe("1")
    expect(recovery.request.params.get("tamanio")).toBe("20")
    recovery.flush(historyWire({ page: 1, size: 20, total: 21 }))
    await page.settle()
    expect(page.range()).toBe("Mostrando 21–21 de 21")
    // Exactly one recovery: no loop, no second read.
    page.http.expectNone(() => true)
  })

  it("shows an empty history as a verified empty state, not as an error", async () => {
    const page = await setup()
    page.catalog().flush(catalogWire())
    page.history().flush(historyWire({ total: 0 }))
    await page.settle()
    expect(page.element.querySelector("[data-history-empty]")?.textContent).toContain(
      "Todavía no se generó ningún reporte"
    )
    expect(page.alertText()).toBe("")
    expect(page.range()).toBe("Sin registros")
    expect(page.element.querySelector("app-table-pagination")).toBeNull()
    page.noGeneration()
  })

  it("keeps the verified history visible through a failed refresh and never generates", async () => {
    const page = await setup()
    page.catalog().flush(catalogWire())
    page.history().flush(historyWire({ total: 1 }))
    await page.settle()
    expect(page.element.querySelector("[data-history-table]")).not.toBeNull()

    await page.click("Actualizar historial")
    page.history().flush("down", { status: 500, statusText: "Server Error" })
    await page.settle()
    expect(page.alertText()).toContain("El historial puede estar desactualizado")
    expect(page.element.querySelector("[data-history-table]")).not.toBeNull()
    // Refreshing the history is a read only: it never generates.
    page.noGeneration()
  })
})
