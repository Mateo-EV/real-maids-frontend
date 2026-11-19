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
import { REPORT_DOWNLOAD_RUNTIME } from "../../../infrastructure/export/report-csv-download"
import { provideReportsSettingsReads } from "../../../reports-settings.providers"
import { ReportsPage } from "./reports-page"

const base = "https://api.example.test"
const catalogUrl = `${base}/api/reportes`
const historyUrl = `${base}/api/reportes/generados`
const csvUrl = `${base}/api/reportes/CLIENTES/csv`
const deadline = 4102444800000
const caller = () => AuthSession.create("Caller", "caller@example.test", null, deadline, 19)

const catalogWire = () => [
  { tipo: "CLIENTES", titulo: "Clientes", descripcion: "Actividad de clientes" },
  { tipo: "ORDENES", titulo: "Órdenes", descripcion: "Órdenes del período" }
]

const tableWire = () => ({
  tipo: "CLIENTES",
  titulo: "Clientes",
  desde: "2026-01-01",
  hasta: "2026-01-31",
  generadoEn: "2026-02-11T09:15:00-05:00",
  columnas: ["Cliente"],
  filas: [["Ana"]]
})

const historyItem = (id: number) => ({
  idReporte: id,
  tipo: "CLIENTES",
  formato: "JSON",
  parametros: null,
  usuario: "Caller",
  fechaGeneracion: "2026-02-11T09:15:00-05:00"
})

const historyWire = (total = 1) => ({
  contenido: Array.from({ length: Math.min(20, total) }, (_, index) => historyItem(index + 1)),
  pagina: 0,
  tamanio: 20,
  totalElementos: total,
  totalPaginas: Math.ceil(total / 20)
})

/** Bytes in this realm (a Node `TextEncoder` buffer would fail the `instanceof` check). */
const csvBytes = (text = "Cliente\nAna\n") => {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff
  return bytes.buffer
}

const isCsv = (url: string) => url.endsWith("/csv")

async function setup(options: { server?: boolean } = {}) {
  const session = new BehaviorSubject<AuthSession | null>(caller())
  const success = vi.fn()
  const names: string[] = []
  const revokeURL = vi.fn((_url: string) => undefined)
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
      { provide: HotToastService, useValue: { success } },
      {
        provide: REPORT_DOWNLOAD_RUNTIME,
        useValue: {
          createURL: vi.fn((_blob: Blob) => "blob:report-csv"),
          revokeURL,
          click: vi.fn((anchor: HTMLAnchorElement) => {
            names.push(anchor.download)
          })
        }
      }
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
  const pending = (url: string) => http.expectOne(request => request.url === url)
  const button = (label: string) => {
    const found = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
    expect(found, label).toBeDefined()
    return found!
  }
  const click = async (label: string) => {
    const target = button(label)
    target.click()
    await settle()
    return target
  }
  return {
    harness,
    element,
    http,
    session,
    success,
    names,
    revokeURL,
    settle,
    catalog: () => pending(catalogUrl),
    history: () => pending(historyUrl),
    generation: (type = "CLIENTES") => pending(`${catalogUrl}/${type}`),
    csv: () => pending(csvUrl),
    noCsv: () => http.expectNone(request => isCsv(request.url)),
    button,
    click,
    select: async (value: string) => {
      const control = element.querySelector<HTMLSelectElement>("select#report-type")!
      control.value = value
      control.dispatchEvent(new Event("change", { bubbles: true }))
      await settle()
    },
    date: async (id: string, value: string) => {
      const control = element.querySelector<HTMLInputElement>(`input#${id}`)!
      control.value = value
      control.dispatchEvent(new Event("input", { bubbles: true }))
      await settle()
    },
    page: () => harness.routeDebugElement!.injector.get(ReportsPage)
  }
}

/** Entry + a verified report for `CLIENTES`, the only state a download can start from. */
async function generated(page: Awaited<ReturnType<typeof setup>>) {
  page.catalog().flush(catalogWire())
  page.history().flush(historyWire())
  await page.settle()
  await page.select("CLIENTES")
  await page.click("Generar")
  page.generation("CLIENTES").flush(tableWire())
  await page.settle()
  page.history().flush(historyWire())
  await page.settle()
  page.http.expectNone(() => true)
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    TestBed.resetTestingModule()
  }
})

// W7 / S5: the CSV is an effect over a GET, so only an explicit click on the loaded report asks.
describe("ReportsPage CSV download", () => {
  it("downloads exactly once from one click and refreshes the history exactly once", async () => {
    const page = await setup()
    await generated(page)
    expect(page.element.querySelector("[data-report-table]")).not.toBeNull()
    page.noCsv()

    const action = await page.click("Descargar CSV")
    const download = page.csv()
    expect(download.request.method).toBe("GET")
    expect(download.request.transferCache).toBe(false)
    expect(download.request.responseType).toBe("arraybuffer")
    // Only the drafted period travels; this report was generated without one.
    expect(download.request.params.keys()).toEqual([])
    // While the download is in flight the action is unavailable and refused, not queued.
    expect(action.disabled).toBe(true)
    page.page().downloadCsv()
    await page.settle()
    page.noCsv()

    download.flush(csvBytes(), {
      headers: {
        "content-type": "text/csv; charset=UTF-8",
        "content-disposition": 'attachment; filename="reporte-clientes.csv"'
      }
    })
    await page.settle()
    // A confirmed download registered the report, so the history is refreshed exactly once.
    const refresh = page.history()
    expect([refresh.request.params.get("pagina"), refresh.request.params.get("tamanio")]).toEqual([
      "0",
      "20"
    ])
    refresh.flush(historyWire(2))
    await page.settle()

    // The supplied filename reached the anchor, the URL was reclaimed and the table stayed.
    expect(page.names).toEqual(["reporte-clientes.csv"])
    expect(page.revokeURL).toHaveBeenCalledExactlyOnceWith("blob:report-csv")
    // One toast from the generation and exactly one from the confirmed download.
    expect(page.success).toHaveBeenCalledTimes(2)
    expect(page.success).toHaveBeenLastCalledWith("Descarga del reporte iniciada.")
    expect(page.element.querySelector("[data-report-table]")).not.toBeNull()
    expect(page.element.querySelector("[data-download-error]")).toBeNull()
    page.http.expectNone(() => true)

    // A settled download is never replayed: a second click would be a second request.
    page.noCsv()
  })

  it("reports a failed download as an unknown outcome without reading the history", async () => {
    const page = await setup()
    await generated(page)

    await page.click("Descargar CSV")
    page.csv().flush(new ArrayBuffer(0), { status: 500, statusText: "Server Error" })
    await page.settle()

    const alert = page.element.querySelector("[data-download-error]")
    expect(alert, "Missing download error").not.toBeNull()
    const text = alert!.textContent ?? ""
    expect(text).toContain("No se pudo contactar al servidor")
    // The server may have registered the record before the transport failed.
    expect(text).toContain("desconocido")
    expect(text).toContain("Revisá el historial")
    expect(text).not.toContain("no se registró")
    // Nothing reached the browser and the failed read is not retried on its own.
    expect(page.names).toEqual([])
    // Only the successful generation toasted; the failure added no success feedback.
    expect(page.success).toHaveBeenCalledOnce()
    page.http.expectNone(() => true)

    // Only a new explicit click asks again.
    await page.click("Descargar CSV")
    page.csv()
  })

  it("never downloads on entry or while the type and the period are being chosen", async () => {
    const page = await setup()
    page.catalog().flush(catalogWire())
    page.history().flush(historyWire())
    await page.settle()
    page.noCsv()
    expect(page.button("Descargar CSV").disabled).toBe(true)

    await page.select("CLIENTES")
    await page.date("report-from", "2026-01-01")
    await page.date("report-to", "2026-01-31")
    // Editing the draft is not a downloaded report: the action stays unavailable.
    expect(page.button("Descargar CSV").disabled).toBe(true)
    page.http.expectNone(() => true)
    page.noCsv()
  })

  it("dispatches nothing at all on the server", async () => {
    const page = await setup({ server: true })
    page.http.expectNone(() => true)
    expect(page.button("Descargar CSV").disabled).toBe(true)

    page.page().downloadCsv()
    await page.settle()
    page.http.expectNone(() => true)
  })
})
