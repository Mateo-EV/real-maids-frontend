import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, firstValueFrom } from "rxjs"
import { afterEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideReportsSettingsReads } from "../../reports-settings.providers"
import { ReportsStore } from "./reports.store"

const base = "https://api.example.test"
const catalogUrl = `${base}/api/reportes`
const reportUrl = `${base}/api/reportes/CLIENTES`
const csvUrl = `${base}/api/reportes/CLIENTES/csv`
const deadline = 4102444800000
const caller = (id = 19, expires = deadline) =>
  AuthSession.create("Caller", `caller${id}@example.test`, null, expires, id)

const catalogWire = () => [{ tipo: "CLIENTES", titulo: "Clientes", descripcion: "Actividad" }]

const tableWire = () => ({
  tipo: "CLIENTES",
  titulo: "Clientes",
  desde: "2026-01-01",
  hasta: "2026-01-31",
  generadoEn: "2026-02-11T09:15:00-05:00",
  columnas: ["Cliente"],
  filas: [["Ana"]]
})

/** Bytes in this realm (a Node `TextEncoder` buffer would fail the `instanceof` check). */
const csvBytes = (text = "Cliente\nAna\n") => {
  const bytes = new Uint8Array(text.length)
  for (let index = 0; index < text.length; index += 1) bytes[index] = text.charCodeAt(index) & 0xff
  return bytes.buffer
}

function setup(options: { server?: boolean; session?: boolean } = {}) {
  const session = new BehaviorSubject<AuthSession | null>(
    options.session === false ? null : caller()
  )
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideReportsSettingsReads(),
      { provide: API_URL, useValue: base },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } }
    ]
  })
  return {
    store: TestBed.inject(ReportsStore),
    http: TestBed.inject(HttpTestingController),
    session
  }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    TestBed.resetTestingModule()
  }
})

/** Catalog + a verified report for `CLIENTES`: the loaded report a download starts from. */
async function loaded(context: ReturnType<typeof setup>) {
  const catalog = firstValueFrom(context.store.observeTypes())
  context.http.expectOne(request => request.url === catalogUrl).flush(catalogWire())
  await catalog
  const report = firstValueFrom(context.store.generate({ type: "CLIENTES" }))
  context.http.expectOne(request => request.url === reportUrl).flush(tableWire())
  await report
}

// W7 / S5: the CSV of a loaded report is an effect, dispatched only by an explicit action.
describe("ReportsStore CSV download", () => {
  it("refuses a download without a report this store verified and dispatches nothing", async () => {
    const context = setup()
    const unloaded = await firstValueFrom(context.store.downloadCsv({ type: "CLIENTES" }))
    expect(!unloaded.success && unloaded.error.code).toBe("VALIDATION")
    context.http.expectNone(() => true)

    // A verified report is still the only basis for a download.
    await loaded(context)
    const other = await firstValueFrom(
      context.store.downloadCsv({ type: "CLIENTES", from: "2025-01-01", to: "2025-01-31" })
    )
    expect(!other.success && other.error.code).toBe("VALIDATION")
    const blank = await firstValueFrom(context.store.downloadCsv({ type: "   " }))
    expect(!blank.success && blank.error.code).toBe("VALIDATION")
    context.http.expectNone(() => true)
  })

  it("downloads the loaded report once and refuses a duplicate while in flight", async () => {
    const context = setup()
    await loaded(context)

    const first = firstValueFrom(context.store.downloadCsv({ type: "CLIENTES" }))
    expect(context.store.downloading()).toBe(true)
    const duplicate = await firstValueFrom(context.store.downloadCsv({ type: "CLIENTES" }))
    expect(!duplicate.success && duplicate.error.code).toBe("CONFLICT")
    // One request for two asks.
    const requests = context.http.match(request => request.url === csvUrl)
    expect(requests).toHaveLength(1)
    expect(requests[0].request.method).toBe("GET")
    expect(requests[0].request.transferCache).toBe(false)
    requests[0].flush(csvBytes(), {
      headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="a.csv"' }
    })
    const result = await first
    expect(result.success && result.data.fileName).toBe("a.csv")
    expect(context.store.downloading()).toBe(false)
    // The loaded report stays visible: the download never rewrites it.
    expect(context.store.selectReport().result?.title).toBe("Clientes")
    context.http.expectNone(() => true)
  })

  it("never retries a failed download and keeps the verified report", async () => {
    const context = setup()
    await loaded(context)
    const read = firstValueFrom(context.store.downloadCsv({ type: "CLIENTES" }))
    context.http
      .expectOne(request => request.url === csvUrl)
      .flush(new ArrayBuffer(0), { status: 500, statusText: "Server Error" })
    const result = await read
    expect(!result.success && result.error.code).toBe("NETWORK")
    expect(context.store.downloading()).toBe(false)
    expect(context.store.selectReport().result?.title).toBe("Clientes")
    context.http.expectNone(() => true)
  })

  it("dispatches nothing on the server or without a session", async () => {
    const server = setup({ server: true })
    let emitted = false
    server.store.downloadCsv({ type: "CLIENTES" }).subscribe({ next: () => (emitted = true) })
    expect(emitted).toBe(false)
    server.http.expectNone(() => true)

    TestBed.resetTestingModule()
    const anonymous = setup({ session: false })
    anonymous.store.downloadCsv({ type: "CLIENTES" }).subscribe({ next: () => (emitted = true) })
    expect(emitted).toBe(false)
    anonymous.http.expectNone(() => true)
    expect(anonymous.store.selectReport().result).toBeUndefined()
  })

  it("clears and fences a download whose session was replaced", async () => {
    const context = setup()
    await loaded(context)
    let emitted = false
    context.store.downloadCsv({ type: "CLIENTES" }).subscribe({
      next: () => (emitted = true),
      error: () => undefined
    })
    context.http.expectOne(request => request.url === csvUrl)
    context.session.next(caller(23))
    expect(emitted).toBe(false)
    expect(context.store.downloading()).toBe(false)
    context.http.expectNone(() => true)
  })
})
