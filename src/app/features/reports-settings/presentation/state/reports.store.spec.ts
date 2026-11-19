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

function setup(server = false) {
  const session = new BehaviorSubject<AuthSession | null>(caller())
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideReportsSettingsReads(),
      { provide: API_URL, useValue: base },
      { provide: PLATFORM_ID, useValue: server ? "server" : "browser" },
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

const loadCatalog = async (context: ReturnType<typeof setup>) => {
  const read = firstValueFrom(context.store.observeTypes())
  context.http.expectOne(request => request.url === catalogUrl).flush(catalogWire())
  expect((await read).success).toBe(true)
}

// W6 / D2-like freshness (S4): there is no cross-visit cache, so a new subscription reads.
describe("ReportsStore reads", () => {
  it("performs one request per subscription and never replays a settled read", async () => {
    const context = setup()
    await loadCatalog(context)
    await loadCatalog(context)
    expect(context.http.match(request => request.url === catalogUrl)).toHaveLength(0)

    // A new subscription is a new read: the catalog is never served from a retained entry.
    const third = firstValueFrom(context.store.observeTypes())
    context.http.expectOne(request => request.url === catalogUrl).flush(catalogWire())
    expect((await third).success).toBe(true)
  })

  it("dispatches nothing on the server", async () => {
    const context = setup(true)
    let emitted = false
    context.store.observeTypes().subscribe({ next: () => (emitted = true) })
    expect(emitted).toBe(false)
    context.http.expectNone(() => true)
    expect(context.store.selectTypes().result).toBeUndefined()
  })
})

// W6 / S5: the only dispatch path of a generation is an explicit, verified, single action.
describe("ReportsStore generate", () => {
  it("refuses a generation without a verified catalog type and dispatches nothing", async () => {
    const context = setup()
    const before = await firstValueFrom(context.store.generate({ type: "CLIENTES" }))
    expect(!before.success && before.error.code).toBe("VALIDATION")
    await loadCatalog(context)
    const unknown = await firstValueFrom(context.store.generate({ type: "OTRO" }))
    expect(!unknown.success && unknown.error.code).toBe("VALIDATION")
    const blank = await firstValueFrom(context.store.generate({ type: "  " }))
    expect(!blank.success && blank.error.code).toBe("VALIDATION")
    context.http.expectNone(() => true)
  })

  it("refuses a duplicate while one generation is in flight instead of queueing it", async () => {
    const context = setup()
    await loadCatalog(context)
    const first = firstValueFrom(context.store.generate({ type: "CLIENTES" }))
    const duplicate = await firstValueFrom(context.store.generate({ type: "CLIENTES" }))
    expect(!duplicate.success && duplicate.error.code).toBe("CONFLICT")
    const requests = context.http.match(request => request.url === reportUrl)
    expect(requests, "one request for two asks").toHaveLength(1)
    expect(context.store.generating()).toBe(true)
    requests[0].flush(tableWire())
    expect((await first).success).toBe(true)
    expect(context.store.generating()).toBe(false)
    expect(context.store.selectReport().result?.title).toBe("Clientes")
  })

  it("never retries a failed generation on its own", async () => {
    const context = setup()
    await loadCatalog(context)
    const read = firstValueFrom(context.store.generate({ type: "CLIENTES" }))
    context.http
      .expectOne(request => request.url === reportUrl)
      .flush("boom", { status: 500, statusText: "Server Error" })
    const result = await read
    expect(!result.success && result.error.code).toBe("NETWORK")
    context.http.expectNone(() => true)
    expect(context.store.selectReport().result).toBeUndefined()
    expect(context.store.selectReport().error?.code).toBe("NETWORK")
  })

  it("keeps a report visible only for its own type and period", async () => {
    const context = setup()
    await loadCatalog(context)
    const read = firstValueFrom(
      context.store.generate({ type: "CLIENTES", from: "2026-01-01", to: "2026-01-31" })
    )
    context.http.expectOne(request => request.url === reportUrl).flush(tableWire())
    await read
    const entry = context.store.selectReport()
    expect(entry.params && entry.params.type).toBe("CLIENTES")
    expect(entry.params && entry.params.from).toBe("2026-01-01")
    // The entry keeps its own request identity: a different period is a different report.
    expect(entry.params && entry.params.to).toBe("2026-01-31")
  })
})

// W6 / S5: session replacement clears and fences, and a stale answer never lands.
describe("ReportsStore session fencing", () => {
  it("clears verified state and fences the old generation when the session is replaced", async () => {
    const context = setup()
    await loadCatalog(context)
    let emitted = false
    context.store.generate({ type: "CLIENTES" }).subscribe({
      next: () => (emitted = true),
      error: () => undefined
    })
    const request = context.http.expectOne(candidate => candidate.url === reportUrl)
    void request
    context.session.next(caller(23))
    expect(context.store.selectTypes().result).toBeUndefined()
    // The in-flight request is cancelled with its session; nothing arrives to be accepted.
    expect(emitted).toBe(false)
    expect(context.store.selectReport().result).toBeUndefined()
    expect(context.store.generating()).toBe(false)
    context.http.expectNone(() => true)
  })
})
