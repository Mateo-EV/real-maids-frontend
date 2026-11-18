import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
import { provideCustomerSupportReads } from "../../../customer-support.providers"
import { SupportRequestsPage } from "./support-requests-page"

const api = "https://api.example.test/api/atenciones"
const typesApi = "https://api.example.test/api/catalogos/tipos-atencion"
const inbox = "/admin/support"
const deadline = 4102444800000
const caller = (id = 19, expires = deadline, name = "Caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, expires, id)

// Wire DTO of AtencionResponse; the adapter rejects any partial or misaligned page.
const dto = (id = 17, subject = "Consulta de facturación", customer = "Cliente autorizado") => ({
  idAtencion: id,
  idCliente: 8,
  cliente: customer,
  idOrden: null,
  codigoOrden: null,
  idTipo: 4,
  tipo: "Consulta",
  requiereRespuesta: true,
  estado: "RECIBIDA",
  estadoNombre: "Recibida",
  asunto: subject,
  descripcion: "Descripción literal",
  fechaRegistro: "2026-03-02T04:30:00Z",
  fechaCierre: null
})

const page = (pagina = 0, tamanio = 20, totalElementos = 45, first = dto()) => {
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

const types = [
  { idTipo: 4, nombre: "Consulta", requiereRespuesta: true },
  { idTipo: 7, nombre: "Queja", requiereRespuesta: true }
]

/** Interactive inbox owns the customer picker; its paged/search read is stubbed here. */
const customerItems = signal<{ id: number; name: string; isActive: boolean }[]>([])
const customerEntries: { query: unknown; force: boolean }[] = []
const customersStub = {
  selectQuery: () => ({
    result: { items: customerItems(), offset: 0, limit: 20, total: customerItems().length },
    loading: false,
    refreshing: false,
    error: undefined
  }),
  observeQuery: (query: unknown, force = false) => {
    customerEntries.push({ query, force })
    return new BehaviorSubject(undefined).asObservable()
  }
}

async function mount(options: { server?: boolean; guest?: boolean } = {}) {
  customerItems.set([
    { id: 8, name: "Cliente autorizado", isActive: true },
    { id: 9, name: "Cliente inactivo", isActive: false },
    { id: 10, name: "Otro cliente", isActive: true }
  ])
  customerEntries.splice(0)
  const session = new BehaviorSubject<AuthSession | null>(options.guest ? null : caller())
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideCustomerSupportReads(),
      provideRouter([{ path: "admin/support", component: SupportRequestsPage }]),
      { provide: CustomersStore, useValue: customersStub },
      { provide: API_URL, useValue: "https://api.example.test" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" }
    ]
  })
  const harness = await RouterTestingHarness.create(inbox)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = harness.routeNativeElement!
  const http = TestBed.inject(HttpTestingController)
  /** The single in-flight inbox read; paging and business keys are asserted per test. */
  const list = () => {
    const pending = http.expectOne(request => request.url === api)
    expect(pending.request.method).toBe("GET")
    expect(pending.request.transferCache).toBe(false)
    return pending
  }
  const send = async (body: object) => {
    const pending = list()
    pending.flush(body)
    await settle()
    return pending.request.params
  }
  /** The type catalog read resolves independently of the inbox query in the filter row. */
  const flushCatalog = async () => {
    http.expectOne(typesApi).flush(types)
    await settle()
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
  const typeSelect = () => element.querySelector<HTMLSelectElement>("select#support-filter-type")!
  const stateSelect = () => element.querySelector<HTMLSelectElement>("select#support-filter-state")!
  return {
    harness,
    element,
    http,
    session,
    settle,
    list,
    send,
    flushCatalog,
    click,
    typeSelect,
    stateSelect
  }
}

afterEach(() => vi.restoreAllMocks())

// WP8 T4 / D1, S11: inbox leaf consumer, not route/sidebar integration (see the group spec).
describe("SupportRequestsPage inbox", () => {
  it("starts with one 0/20 list GET plus the type catalog, and renders supplied values as plain text", async () => {
    const s = await mount()
    expect(s.element.querySelector("app-catalog-frame h1")?.textContent).toContain(
      "Soporte al cliente"
    )
    expect(s.element.textContent).toMatch(/Cargando atenciones/)
    expect(s.element.textContent).not.toMatch(/No hay atenciones|0–0 de 0/)
    // S3/S4: the type catalog is a size-free finite read, not a paginated list.
    const catalog = s.http.expectOne(typesApi)
    expect(catalog.request.method).toBe("GET")
    expect(catalog.request.transferCache).toBe(false)
    expect(catalog.request.params.keys()).toEqual([])
    const params = await s.send(page(0, 20, 1, dto(17, "<b>Asunto literal</b>")))
    expect(params.keys().sort()).toEqual(["pagina", "tamanio"])
    expect([params.get("pagina"), params.get("tamanio")]).toEqual(["0", "20"])
    catalog.flush(types)
    await s.settle()
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const records = s.element.querySelector(selector)!
      expect(records, selector).not.toBeNull()
      expect(records.textContent).toContain("<b>Asunto literal</b>")
      expect(records.textContent).toContain("Cliente autorizado")
      expect(records.textContent).toContain("Consulta")
      // S4: the badge carries the code and the supplied name, so colour is never alone.
      expect(records.textContent).toContain("RECIBIDA · Recibida")
      expect(records.textContent).toContain("2026-03-02T04:30:00.000Z")
      expect(records.textContent).toMatch(/requiere respuesta/i)
      expect(records.querySelector("b")).toBeNull()
      // T4 boundary: no row link exists until the T5 detail consumer does.
      expect(records.querySelector("a")).toBeNull()
    }
    expect(s.element.querySelectorAll("[catalogDesktop] tbody tr")).toHaveLength(1)
    expect(s.element.querySelectorAll("ul[catalogMobile] > li")).toHaveLength(1)
    s.http.expectNone(() => true)
  })

  it("sends each chosen filter as its documented server key and omits every blank one", async () => {
    const s = await mount()
    await s.send(page(0, 20, 45))
    await s.flushCatalog()
    const filters = () => s.element.querySelector("app-catalog-filters")! as HTMLElement
    // S4: the closed backend enum plus the explicit "all" option; no status catalog exists.
    expect(
      Array.from(s.stateSelect().options).map(option => [option.value, option.textContent?.trim()])
    ).toEqual([
      ["", "Todos los estados"],
      ["RECIBIDA", "RECIBIDA"],
      ["EN_REVISION", "EN_REVISION"],
      ["RESUELTA", "RESUELTA"],
      ["CERRADA", "CERRADA"]
    ])
    const state = s.stateSelect()
    state.value = "RESUELTA"
    state.dispatchEvent(new Event("change", { bubbles: true }))
    await s.settle()
    const afterState = await s.send(page(0, 20, 45))
    expect([afterState.get("pagina"), afterState.get("tamanio"), afterState.get("estado")]).toEqual(
      ["0", "20", "RESUELTA"]
    )
    const type = s.typeSelect()
    // Only the verified catalog values become filters.
    expect(
      Array.from(type.options).map(option => [option.value, option.textContent?.trim()])
    ).toEqual([
      ["", "Todos los tipos"],
      ["4", "Consulta"],
      ["7", "Queja"]
    ])
    type.value = "7"
    type.dispatchEvent(new Event("change", { bubbles: true }))
    await s.settle()
    const afterType = await s.send(page(0, 20, 45))
    expect([afterType.get("estado"), afterType.get("idTipo"), afterType.has("idCliente")]).toEqual([
      "RESUELTA",
      "7",
      false
    ])
    const from = filters().querySelector<HTMLInputElement>("input#support-filter-from")!
    const until = filters().querySelector<HTMLInputElement>("input#support-filter-until")!
    expect([from.type, until.type]).toEqual(["date", "date"])
    from.value = "2024-01-01"
    from.dispatchEvent(new Event("input", { bubbles: true }))
    await s.settle()
    const afterFrom = await s.send(page(0, 20, 45))
    expect([afterFrom.get("desde"), afterFrom.has("hasta")]).toEqual(["2024-01-01", false])
    until.value = "2024-01-31"
    until.dispatchEvent(new Event("input", { bubbles: true }))
    await s.settle()
    const afterUntil = await s.send(page(0, 20, 45))
    expect([
      afterUntil.get("estado"),
      afterUntil.get("idTipo"),
      afterUntil.get("desde"),
      afterUntil.get("hasta")
    ]).toEqual(["RESUELTA", "7", "2024-01-01", "2024-01-31"])
    // Clearing a filter omits the key instead of sending an empty value.
    state.value = ""
    state.dispatchEvent(new Event("change", { bubbles: true }))
    await s.settle()
    const cleared = await s.send(page(0, 20, 45))
    expect(cleared.has("estado")).toBe(false)
    expect([cleared.get("idTipo"), cleared.get("desde"), cleared.get("hasta")]).toEqual([
      "7",
      "2024-01-01",
      "2024-01-31"
    ])
    s.http.expectNone(() => true)
  })

  it("restarts a filtered query at offset zero while keeping the effective page size", async () => {
    const s = await mount()
    await s.send(page(0, 20, 45))
    await s.flushCatalog()
    await s.click("Página 2")
    const second = s.list()
    expect([second.request.params.get("pagina"), second.request.params.get("tamanio")]).toEqual([
      "1",
      "20"
    ])
    second.flush(page(1, 20, 45))
    await s.settle()
    expect(s.element.textContent).toContain("21–40 de 45")
    const state = s.stateSelect()
    state.value = "CERRADA"
    state.dispatchEvent(new Event("change", { bubbles: true }))
    await s.settle()
    const filtered = s.list()
    // Effective size 20 is kept and the filtered query restarts at the first page.
    expect([
      filtered.request.params.get("pagina"),
      filtered.request.params.get("tamanio"),
      filtered.request.params.get("estado")
    ]).toEqual(["0", "20", "CERRADA"])
  })

  it("adopts the returned effective metadata in the footer and one-based paging without another GET", async () => {
    const s = await mount()
    await s.send(page(0, 20, 45))
    await s.flushCatalog()
    expect(s.element.textContent).toContain("1–20 de 45")
    expect(
      s.element.querySelector('app-table-pagination [aria-current="page"]')?.textContent?.trim()
    ).toBe("1")
    expect(
      s.element.querySelector<HTMLButtonElement>('button[aria-label="Página anterior"]')?.disabled
    ).toBe(true)
    await s.click("Página 3")
    const third = s.list()
    expect(third.request.params.get("pagina")).toBe("2")
    third.flush(page(2, 20, 45))
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.element.textContent).toContain("41–45 de 45")
    expect(
      s.element.querySelector('app-table-pagination [aria-current="page"]')?.textContent?.trim()
    ).toBe("3")
    expect(
      s.element.querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')?.disabled
    ).toBe(true)
    expect(
      s.element.querySelector<HTMLButtonElement>('button[aria-label="Página anterior"]')?.disabled
    ).toBe(false)
  })

  it("distinguishes initial loading, retryable error and verified empty without inventing totals", async () => {
    const s = await mount()
    expect(s.element.textContent).toMatch(/Cargando atenciones/)
    expect(s.element.querySelector("app-catalog-frame table")).toBeNull()
    s.list().flush({ mensaje: "RAW INTERNAL DETAIL" }, { status: 403, statusText: "Forbidden" })
    await s.flushCatalog()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/permiso/i)
    expect(s.element.textContent).not.toMatch(/No hay atenciones|RAW INTERNAL DETAIL|0–0 de 0/)
    expect(s.element.textContent).toMatch(/sin verificar/i)
    await s.click("Reintentar")
    const retry = s.list()
    // A retry is a GET of the same documented query, never a replayed write.
    expect(retry.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    retry.flush({ contenido: [], pagina: 0, tamanio: 20, totalElementos: 0, totalPaginas: 0 })
    await s.settle()
    expect(s.element.textContent).toMatch(/No hay atenciones/)
    expect(s.element.textContent).toContain("0–0 de 0")
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
    s.http.expectNone(() => true)
  })

  it("keeps verified rows visible while a stale same-query revalidation refreshes or fails", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await mount()
    await s.send(page(0, 20, 45, dto(17, "Asunto de la página uno")))
    await s.flushCatalog()
    await s.click("Página 2")
    await s.send(page(1, 20, 45, dto(18, "Asunto de la página dos")))
    expect(s.element.textContent).toContain("Asunto de la página dos")
    // D2: 30000 ms success-only freshness; the retained entry is revalidated on the read.
    clock.mockReturnValue(31001)
    await s.click("Página anterior")
    const refresh = s.list()
    expect(s.element.textContent).toContain("Asunto de la página uno")
    expect(s.element.textContent).not.toContain("Asunto de la página dos")
    expect(s.element.textContent).toMatch(/Actualizando atenciones/)
    refresh.error(new ProgressEvent("error"))
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/desactualizados/i)
    expect(s.element.textContent).toContain("Asunto de la página uno")
    await s.click("Reintentar")
    const retry = s.list()
    expect(s.element.textContent).toContain("Asunto de la página uno")
    retry.flush(page(0, 20, 45, dto(17, "Asunto de la página uno")))
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
    s.http.expectNone(() => true)
  })

  it("never shows another query's rows while a new page or filter is unverified", async () => {
    const s = await mount()
    await s.send(page(0, 20, 45, dto(17, "Asunto de la página uno")))
    await s.flushCatalog()
    expect(s.element.textContent).toContain("Asunto de la página uno")
    await s.click("Página 2")
    // The requested query has no verified entry yet: no borrowed rows and no false empty claim.
    expect(s.element.textContent).not.toContain("Asunto de la página uno")
    expect(s.element.textContent).not.toMatch(/No hay atenciones|0–0 de 0/)
    await s.send(page(1, 20, 45, dto(18, "Asunto de la página dos")))
    expect(s.element.textContent).toContain("Asunto de la página dos")
    expect(s.element.textContent).not.toContain("Asunto de la página uno")
    s.http.expectNone(() => true)
  })

  it("allows one bounded out-of-range recovery per user action and never invents totals", async () => {
    const s = await mount()
    await s.send(page(0, 20, 45))
    await s.flushCatalog()
    await s.click("Página 3")
    // The first empty response is out of range, so exactly one correction is requested.
    const stale = s.list()
    expect(stale.request.params.get("pagina")).toBe("2")
    stale.flush(page(2, 20, 1))
    await s.settle()
    const recovery = s.list()
    expect(recovery.request.params.get("pagina")).toBe("0")
    recovery.flush(page(0, 20, 1))
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.element.textContent).toContain("1–1 de 1")
    expect(s.element.textContent).toContain("Cliente autorizado")
  })

  it("clears active filters from the verified empty state with one unfiltered read", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await mount()
    await s.send(page(0, 20, 0))
    await s.flushCatalog()
    expect(s.element.textContent).toMatch(/No hay atenciones/)
    expect(s.element.textContent).not.toContain("Limpiar filtros")
    const state = s.stateSelect()
    state.value = "CERRADA"
    state.dispatchEvent(new Event("change", { bubbles: true }))
    await s.settle()
    const filtered = s.list()
    expect(filtered.request.params.get("estado")).toBe("CERRADA")
    filtered.flush(page(0, 20, 0))
    await s.settle()
    expect(s.element.textContent).toContain("Limpiar filtros")
    // Past the success-only freshness window the unfiltered entry is revalidated by one read.
    clock.mockReturnValue(31001)
    await s.click("Limpiar filtros")
    const cleared = s.list()
    expect(cleared.request.params.has("estado")).toBe(false)
    expect(cleared.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    cleared.flush(page(0, 20, 1))
    await s.settle()
    expect(s.element.textContent).toContain("Cliente autorizado")
    expect(s.element.querySelector("[catalogDesktop], [catalogMobile]")).not.toBeNull()
    s.http.expectNone(() => true)
  })

  it("keeps the type catalog error and retry independent of the inbox query", async () => {
    const s = await mount()
    await s.send(page(0, 20, 1))
    s.http
      .expectOne(typesApi)
      .flush({ mensaje: "RAW" }, { status: 500, statusText: "Server Error" })
    await s.settle()
    expect(s.element.textContent).toContain("Cliente autorizado")
    const wrapper = s.typeSelect().closest("div")! as HTMLElement
    expect(wrapper.querySelector('[role="alert"]')?.textContent).toMatch(/tipos de atención/i)
    // No invented options: the only entry is the explicit "all" value.
    expect(Array.from(s.typeSelect().options).map(option => option.value)).toEqual([""])
    const retry = Array.from(wrapper.querySelectorAll<HTMLButtonElement>("button")).find(
      button => button.textContent?.trim() === "Reintentar"
    )!
    expect(retry).toBeDefined()
    retry.click()
    await s.settle()
    s.http.expectOne(typesApi).flush(types)
    await s.settle()
    expect(Array.from(s.typeSelect().options).map(option => option.value)).toEqual(["", "4", "7"])
    expect(wrapper.querySelector('[role="alert"]')).toBeNull()
    // The shared inbox query was neither re-read nor invalidated by the catalog retry.
    s.http.expectNone(request => request.url === api)
  })

  it("cancels its pending inbox read on destruction without a late result", async () => {
    const s = await mount()
    await s.flushCatalog()
    const pending = s.list()
    s.harness.fixture.destroy()
    expect(pending.cancelled).toBe(true)
    await Promise.resolve()
    s.http.expectNone(() => true)
  })

  it("preserves work on same-session renewal and cancels old work on session replacement", async () => {
    const s = await mount()
    await s.send(page(0, 20, 45, dto(17, "Asunto del titular")))
    await s.flushCatalog()
    s.session.next(caller(19, deadline, "Renewed caller"))
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.element.textContent).toContain("Asunto del titular")
    await s.click("Página 2")
    const obsolete = s.list()
    s.session.next(caller(20, deadline + 1, "Replacement"))
    await s.settle()
    expect(obsolete.cancelled).toBe(true)
    expect(s.element.textContent).not.toContain("Asunto del titular")
    // A replacement identity re-reads its own first page and the finite catalog, nothing else.
    s.http.expectOne(typesApi).flush(types)
    await s.send(page(0, 20, 1, dto(27, "Asunto de reemplazo")))
    expect(s.element.textContent).toContain("Asunto de reemplazo")
    s.http.expectNone(() => true)
  })

  it.each([{ server: true }, { guest: true }])(
    "dispatches no HTTP for SSR/guest %j",
    async options => {
      const s = await mount(options)
      s.http.expectNone(() => true)
      expect(s.element.querySelector("[catalogDesktop], [catalogMobile]")).toBeNull()
      expect(s.element.textContent).not.toMatch(/No hay atenciones|0–0 de 0/)
    }
  )
})
