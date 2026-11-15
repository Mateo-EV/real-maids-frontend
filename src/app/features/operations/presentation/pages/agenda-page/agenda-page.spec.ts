import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, EMPTY } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { FieldStaffStore } from "@/app/features/field-operations/presentation/state/field-staff.store"
import { provideOperationsRequestReads } from "../../../operations.providers"
import { AgendaStore } from "../../state/agenda.store"
import { agendaDto } from "../../state/agenda.testing"
import { AgendaPage } from "./agenda-page"

@Component({ selector: "app-agenda-test-destination", template: "Destination" })
class Destination {}
const api = "https://api.example.test/api/agenda"
const caller = (id = 19, deadline = 4102444800000) =>
  AuthSession.create("Caller", `caller${id}@example.test`, null, deadline, id)

/**
 * The staff picker reads the real authenticated field-staff catalog in production; this leaf
 * owns only the agenda read, so its catalog page is stubbed and every picker read is captured.
 */
const staffItems = signal<{ id: number; name: string; isActive: boolean }[]>([])
const staffQueries: { query: unknown; force: boolean }[] = []
const staffStub = {
  selectStaff: () => ({
    result: { items: staffItems(), offset: 0, limit: 20, total: staffItems().length },
    loading: false,
    refreshing: false,
    error: undefined
  }),
  observeStaff: (query: unknown, force = false) => {
    staffQueries.push({ query, force })
    return EMPTY
  }
}

async function setup(server = false, guest = false) {
  const session = new BehaviorSubject<AuthSession | null>(guest ? null : caller())
  const authFactory = vi.fn(() => ({ session: () => session.value }))
  staffItems.set([
    { id: 77, name: "Operaria filtrada", isActive: true },
    { id: 9, name: "Otra operaria", isActive: true },
    { id: 4, name: "Operaria inactiva", isActive: false }
  ])
  staffQueries.splice(0)
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideOperationsRequestReads(),
      provideRouter([
        { path: "admin/operations/agenda", component: AgendaPage },
        { path: "admin/operations/orders/:id", component: Destination },
        { path: "admin/operations/requests", component: Destination },
        { path: "admin/operations/orders", component: Destination },
        { path: "elsewhere", component: Destination }
      ]),
      { provide: API_URL, useValue: "https://api.example.test" },
      { provide: PLATFORM_ID, useValue: server ? "server" : "browser" },
      { provide: FieldStaffStore, useValue: staffStub },
      { provide: AuthStore, useFactory: authFactory },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } }
    ]
  })
  const harness = await RouterTestingHarness.create("/admin/operations/agenda")
  const http = TestBed.inject(HttpTestingController)
  const element = harness.routeNativeElement!
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const field = async (id: string, value: string) => {
    const control = element.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)
    expect(control, `Missing labeled control ${id}`).not.toBeNull()
    control!.value = value
    control!.dispatchEvent(
      new Event(control!.tagName === "SELECT" ? "change" : "input", { bubbles: true })
    )
    control!.dispatchEvent(new Event("blur"))
    await settle()
  }
  const click = async (label: string) => {
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
      b => b.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    expect(button!.disabled, label).toBe(false)
    button!.click()
    await settle()
  }
  const trigger = () => element.querySelector<HTMLButtonElement>("button#agenda-staff")!
  /** Opens the staff picker; its panel is portaled, so it is read from the document. */
  const openPicker = async () => {
    const button = trigger()
    expect(button, "agenda-staff trigger").not.toBeNull()
    button.click()
    await settle()
    const search = document.querySelector<HTMLInputElement>("input#agenda-staff-search")
    expect(search, "agenda-staff search").not.toBeNull()
    const panel = search!.closest("hlm-combobox-content") as HTMLElement
    expect(panel, "agenda-staff panel").not.toBeNull()
    const options = () => Array.from(panel.querySelectorAll<HTMLElement>('[role="option"]'))
    const values = () =>
      options().map(option => [option.getAttribute("data-value"), option.textContent?.trim()])
    return { search: search!, panel, options, values }
  }
  const closePicker = async (search: HTMLInputElement) => {
    search.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
    await settle()
  }
  /** One verified option click, exactly what a user can do with the picker. */
  const chooseStaff = async (value: string) => {
    const picker = await openPicker()
    const options = picker.options()
    options.forEach(option => (option.scrollIntoView = vi.fn()))
    const option = options.find(item => item.getAttribute("data-value") === value)
    expect(option, `staff option ${value}`).toBeDefined()
    option!.click()
    await settle()
  }
  const request = (from = "2024-02-29", until = from, staff?: string) => {
    const pending = http.expectOne(r => r.url === api)
    expect(pending.request.method).toBe("GET")
    expect(pending.request.body).toBeNull()
    expect(pending.request.transferCache).toBe(false)
    expect(pending.request.params.keys().sort()).toEqual(
      staff ? ["desde", "hasta", "idPersonal"] : ["desde", "hasta"]
    )
    expect(pending.request.params.get("desde")).toBe(from)
    expect(pending.request.params.get("hasta")).toBe(until)
    expect(pending.request.params.get("idPersonal")).toBe(staff ?? null)
    return pending
  }
  return {
    harness,
    element,
    http,
    settle,
    field,
    click,
    request,
    session,
    authFactory,
    trigger,
    openPicker,
    closePicker,
    chooseStaff
  }
}
afterEach(() => {
  TestBed.inject(HttpTestingController).verify()
  vi.restoreAllMocks()
})

// T3 / S3,S4,S5: header filters, searched staff picker and automatic application.
// T7C / S1,S2,S3,S4,S6,S8,S9,S10: real repository/source HTTP and public DOM.
describe("AgendaPage explicit day/seven-day/month consumer", () => {
  it("starts blank, dispatches no agenda read and owns its finite store locally", async () => {
    const s = await setup()
    expect(s.element.querySelector<HTMLInputElement>("#agenda-date")?.value).toBe("")
    expect(s.element.textContent).toContain("Selecciona una fecha")
    expect(s.element.querySelector("app-catalog-frame")).not.toBeNull()
    expect(TestBed.inject(AgendaStore, null)).toBeNull()
    // S4: the only mount read is the staff picker's own catalog page; the agenda stays unread.
    expect(staffQueries).toEqual([
      { query: { offset: 0, limit: 20, isActive: true }, force: false }
    ])
    s.http.expectNone(r => r.url.includes("/api/"))
    // S9: the shell owns the section tabs; this consumer renders none of them.
    expect(s.element.querySelector('a[href="/admin/operations/agenda"]')).toBeNull()
    expect(s.element.querySelector('a[href="/admin/operations/requests"]')).toBeNull()
    expect(s.element.querySelector('a[href="/admin/operations/orders"]')).toBeNull()
    expect(s.element.querySelector("app-catalog-frame header nav")).toBeNull()
  })
  // S3/S5: the controls sit in the frame header; there is no band and no submit action.
  it("renders every filter inside the frame header row with no separate band or submit button", async () => {
    const s = await setup()
    expect(s.element.querySelectorAll("app-catalog-filters")).toHaveLength(1)
    const row = s.element.querySelector("app-catalog-frame header app-catalog-filters")
    expect(row, "Filter row inside the CatalogFrame header").not.toBeNull()
    const controls = row as HTMLElement
    expect(controls.querySelectorAll('input[type="date"]')).toHaveLength(1)
    expect(controls.querySelectorAll("select")).toHaveLength(1)
    expect(controls.querySelectorAll("app-catalog-combobox")).toHaveLength(1)
    expect(s.element.querySelector("form")).toBeNull()
    expect(s.element.querySelector('button[type="submit"]')).toBeNull()
    expect(s.element.textContent).not.toContain("Consultar agenda")
    s.http.expectNone(r => r.url.includes("/api/"))
  })
  it.each([
    ["day", "2024-02-29", "2024-02-29", "Día"],
    ["week", "2024-02-29", "2024-03-06", "7 días desde la fecha seleccionada"],
    ["month", "2024-02-01", "2024-02-29", "Mes completo"]
  ] as const)(
    "queries the explicit %s window without date defaults or inferred staff",
    async (view, from, until, label) => {
      const s = await setup()
      // S5: the view alone applies nothing while the required date is still blank.
      await s.field("agenda-view", view)
      s.http.expectNone(r => r.url === api)
      // S5: choosing the date dispatches immediately, without a submit action.
      await s.field("agenda-date", "2024-02-29")
      expect(s.element.textContent).toContain("Cargando agenda")
      s.request(from, until).flush([agendaDto()])
      await s.settle()
      expect(
        s.element.querySelector('section[aria-label="Programación consultada"] h2')?.textContent
      ).toContain(label)
      // S8: the real calendar renders the explicit window (day/week/month) instead of the old grid.
      expect(s.element.querySelectorAll("[data-date]")).toHaveLength(
        view === "day" ? 3 : view === "week" ? 21 : 42
      )
      expect(s.element.querySelector("[data-time]") !== null).toBe(view !== "month")
      const event = s.element.querySelector("[data-agenda-entry]")
      // The entry's own order id, date and clocks are displayed literally, not inferred.
      expect(event?.getAttribute("data-agenda-order-id")).toBe("17")
      expect(event?.getAttribute("aria-label")).toContain("2024-02-29")
      expect(s.element.textContent).toContain(from)
      expect(s.element.textContent).toContain(until)
      s.http.expectNone(r => r.method !== "GET")
    }
  )
  // S5: the derived window is re-read on the view change itself, keeping the explicit date.
  it("re-dispatches the derived window when the view changes", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    s.request("2024-02-29", "2024-02-29").flush([agendaDto()])
    await s.settle()
    await s.field("agenda-view", "week")
    s.request("2024-02-29", "2024-03-06").flush([agendaDto()])
    await s.settle()
    expect(
      s.element.querySelector('section[aria-label="Programación consultada"] h2')?.textContent
    ).toContain("7 días desde la fecha seleccionada")
    // S8: a seven-day window is seven day cells in the calendar, one per explicit date.
    expect(s.element.querySelectorAll("[data-date]")).toHaveLength(21)
    await s.field("agenda-view", "month")
    s.request("2024-02-01", "2024-02-29").flush([agendaDto()])
    await s.settle()
    expect(
      s.element.querySelector('section[aria-label="Programación consultada"] h2')?.textContent
    ).toContain("Mes completo")
    // The month grid renders the whole selected month and no hour slots at all.
    expect(s.element.querySelectorAll("[data-date]")).toHaveLength(42)
    expect(s.element.querySelector("[data-time]")).toBeNull()
    // The explicit date is never replaced by a default: no /hoy, no inferred staff.
    expect(s.element.querySelector<HTMLInputElement>("#agenda-date")?.value).toBe("2024-02-29")
    s.http.expectNone(r => r.method !== "GET")
  })
  it("sends an explicit staff filter but displays actual different staff returned by own-scope backend", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    s.request().flush([agendaDto()])
    await s.settle()
    await s.chooseStaff("77")
    s.request("2024-02-29", "2024-02-29", "77").flush([agendaDto()])
    await s.settle()
    // S4/S9: the calendar event carries the actual returned staff, not the requested identity.
    const label = () =>
      s.element.querySelector("[data-agenda-entry]")?.getAttribute("aria-label") ?? ""
    expect(label()).toContain("Personal suministrado")
    expect(label()).toContain("ID 9")
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
    // S4: the picker shows the verified server name, and the clear entry restores all staff.
    expect(s.trigger().textContent?.trim()).toBe("Operaria filtrada")
    await s.chooseStaff("")
    expect(s.trigger().textContent?.trim()).toBe("Todo el personal")
    s.request().flush([agendaDto()])
    await s.settle()
    expect(s.element.querySelector("[data-agenda-entry]")).not.toBeNull()
  })
  // S4/S9: the picker is a searched server page; free text can never become a staff identity.
  it("never accepts a staff identity that the verified page does not offer", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    s.request().flush([agendaDto()])
    await s.settle()
    const picker = await s.openPicker()
    expect(picker.values()).toEqual([
      ["77", "Operaria filtrada"],
      ["9", "Otra operaria"]
    ])
    await s.closePicker(picker.search)
    // The numeric free-text input is gone: the control is the picker trigger itself.
    expect(s.element.querySelector("#agenda-staff")?.tagName).toBe("BUTTON")
    const page = s.harness.routeDebugElement!.injector.get(AgendaPage)
    for (const invalid of ["0", "-1", "1.5", "2147483648", "abc", "999"]) page.setStaff(invalid)
    await s.settle()
    s.http.expectNone(r => r.url === api)
    expect(s.trigger().textContent?.trim()).toBe("Todo el personal")
    expect(s.element.querySelector("[data-agenda-entry]")).not.toBeNull()
  })
  // S4/S9: search is debounced and server-side; it never applies itself or re-reads the agenda.
  it("debounces one staff search read and forces exactly one reload of that same query", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    s.request().flush([agendaDto()])
    await s.settle()
    expect(staffQueries).toEqual([
      { query: { offset: 0, limit: 20, isActive: true }, force: false }
    ])
    const picker = await s.openPicker()
    picker.search.value = "  Operaria  "
    picker.search.dispatchEvent(new Event("input", { bubbles: true }))
    picker.search.value = "Operaria filtrada"
    picker.search.dispatchEvent(new Event("input", { bubbles: true }))
    await s.settle()
    // Still debounced: nothing is dispatched before the 250ms window closes.
    expect(staffQueries).toHaveLength(1)
    await new Promise(resolve => setTimeout(resolve, 275))
    await s.settle()
    expect(staffQueries).toEqual([
      { query: { offset: 0, limit: 20, isActive: true }, force: false },
      {
        query: { offset: 0, limit: 20, isActive: true, search: "Operaria filtrada" },
        force: false
      }
    ])
    // S9: searching never selects, clears or re-reads the agenda query.
    expect(s.trigger().textContent?.trim()).toBe("Todo el personal")
    expect(picker.options().every(option => option.getAttribute("aria-selected") !== "true")).toBe(
      true
    )
    s.http.expectNone(r => r.url === api)
    const reload = picker.search.nextElementSibling as HTMLButtonElement
    expect(reload.getAttribute("aria-label")).toBe("Recargar opciones")
    reload.click()
    await s.settle()
    expect(staffQueries.at(-1)).toEqual({
      query: { offset: 0, limit: 20, isActive: true, search: "Operaria filtrada" },
      force: true
    })
    expect(staffQueries).toHaveLength(3)
    s.http.expectNone(() => true)
  })
  it("renders literal clocks/null/plain text/server order and links only actual order IDs", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    const first = agendaDto(22),
      second = agendaDto(17)
    first.cliente = "<img src=x onerror=alert(1)>"
    first.codigo = "  OS-22  "
    s.request().flush([first, second])
    await s.settle()
    const entries = Array.from(s.element.querySelectorAll<HTMLElement>("[data-agenda-entry]"))
    expect(entries).toHaveLength(2)
    const byOrder = (id: string) =>
      entries.find(entry => entry.getAttribute("data-agenda-order-id") === id)!
    // S8: every event keeps the real order id; the click opens that order.
    expect(byOrder("22")).toBeDefined()
    expect(byOrder("17")).toBeDefined()
    expect(byOrder("22").getAttribute("aria-label")).toContain("08:15:49.123456789")
    expect(byOrder("22").getAttribute("aria-label")).toContain("No registrado")
    expect(byOrder("22").textContent).toContain(first.cliente)
    expect(byOrder("22").querySelector("img")).toBeNull()
    byOrder("22").click()
    await s.settle()
    expect(TestBed.inject(Router).url).toBe("/admin/operations/orders/22")
    s.http.expectNone(r => r.method !== "GET")
  })
  // R3-003: FullCalendar draws only its own window, so a returned shift dated outside the
  // requested range must be reported instead of disappearing without explanation.
  it("reports returned shifts outside the requested window instead of dropping them silently", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    s.request().flush([agendaDto(17), agendaDto(22, "2024-03-05")])
    await s.settle()
    const note = [...s.element.querySelectorAll<HTMLElement>('[role="status"]')].find(node =>
      (node.textContent ?? "").includes("fuera del rango")
    )
    expect(note, "out-of-range note").toBeDefined()
    expect(note!.textContent?.trim()).toBe(
      "1 turno devuelto está fuera del rango solicitado y no se dibuja."
    )
    // The note is plain text placed above the calendar: no link and no access detail.
    expect(note!.querySelector("a")).toBeNull()
    expect(note!.textContent).not.toMatch(/SYNTHETIC|instrucciones|código/i)
    const calendar = s.element.querySelector("app-agenda-calendar-view")!
    const siblings = Array.from(note!.parentElement!.children)
    expect(siblings.indexOf(note!)).toBeLessThan(siblings.indexOf(calendar))
    // The window shift is drawn; the outside one is the reason for the note.
    expect(s.element.querySelector('[data-agenda-order-id="17"]')).not.toBeNull()
    expect(s.element.querySelector('[data-agenda-order-id="22"]')).toBeNull()
    s.http.expectNone(r => r.method !== "GET")
  })
  it("renders no out-of-range note when every returned shift is inside the window and counts several otherwise", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    s.request().flush([agendaDto(17), agendaDto(18)])
    await s.settle()
    const notes = () =>
      [...s.element.querySelectorAll<HTMLElement>('[role="status"]')]
        .map(node => node.textContent?.trim() ?? "")
        .filter(text => text.includes("fuera del rango"))
    expect(notes()).toEqual([])
    // Re-applying the same explicit filter re-reads the window: both outside shifts are counted.
    await s.field("agenda-date", "2024-02-29")
    s.request().flush([agendaDto(17), agendaDto(22, "2024-03-05"), agendaDto(23, "2024-02-01")])
    await s.settle()
    expect(notes()).toEqual([
      "2 turnos devueltos están fuera del rango solicitado y no se dibujan."
    ])
    expect(s.element.querySelector('[data-agenda-order-id="17"]')).not.toBeNull()
  })
  it("distinguishes verified empty from initial unverified state", async () => {
    const s = await setup()
    expect(s.element.textContent).not.toContain("No se devolvieron servicios")
    await s.field("agenda-date", "2024-02-29")
    s.request().flush([])
    await s.settle()
    expect(s.element.textContent).toContain("No se devolvieron servicios")
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
  })
  it("preserves same-query verified rows on retry failure and retries only GET", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    s.request().flush([agendaDto()])
    await s.settle()
    // S5: re-applying the same explicit filter is the refresh affordance the removed button had.
    await s.field("agenda-date", "2024-02-29")
    expect(s.element.textContent).toContain("Actualizando agenda")
    expect(s.element.querySelector("[data-agenda-entry]")).not.toBeNull()
    s.request().flush(
      { mensaje: "Private backend detail" },
      { status: 403, statusText: "Forbidden" }
    )
    await s.settle()
    expect(s.element.textContent).toContain("desactualizados")
    expect(s.element.textContent).not.toContain("Private backend detail")
    expect(s.element.querySelector("[data-agenda-entry]")).not.toBeNull()
    await s.click("Reintentar")
    s.request().flush([agendaDto(18)])
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
    expect(s.element.querySelector('[data-agenda-order-id="18"]')).not.toBeNull()
    // S5: a new explicit date applies at once instead of waiting for a submit.
    await s.field("agenda-date", "2024-03-01")
    s.request("2024-03-01").flush([agendaDto(22, "2024-03-01")])
    await s.settle()
    expect(s.element.querySelector('[data-agenda-order-id="22"]')).not.toBeNull()
    s.http.expectNone(r => r.method !== "GET")
  })
  it("cancels superseded query HTTP and hides unrelated rows immediately", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    s.request().flush([agendaDto()])
    await s.settle()
    await s.field("agenda-date", "2024-02-29")
    const old = s.request()
    await s.field("agenda-date", "2024-03-01")
    expect(old.cancelled).toBe(true)
    expect(s.element.querySelector("[data-agenda-entry]")).toBeNull()
    s.request("2024-03-01").flush([], { status: 200, statusText: "OK" })
    await s.settle()
    expect(s.element.querySelector('[data-agenda-order-id="17"]')).toBeNull()
  })
  it("cancels finite GET on page destruction and revisits with blank controls/no cross-visit data", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    const pending = s.request()
    await s.harness.navigateByUrl("/elsewhere")
    expect(pending.cancelled).toBe(true)
    await s.harness.navigateByUrl("/admin/operations/agenda")
    expect(
      s.harness.routeNativeElement!.querySelector<HTMLInputElement>("#agenda-date")?.value
    ).toBe("")
    expect(s.harness.routeNativeElement!.querySelector("[data-agenda-entry]")).toBeNull()
    s.http.expectNone(r => r.url === api)
  })
  it.each([null, caller(20)])(
    "clears/cancels on logout/session replacement without an automatic new query",
    async next => {
      const s = await setup()
      await s.field("agenda-date", "2024-02-29")
      s.request().flush([agendaDto()])
      await s.settle()
      await s.field("agenda-date", "2024-02-29")
      const pending = s.request()
      s.session.next(next)
      await s.settle()
      expect(pending.cancelled).toBe(true)
      expect(s.element.querySelector("[data-agenda-entry]")).toBeNull()
      // A replaced session owns nothing: controls are blank again and nothing is re-read.
      expect(s.element.querySelector<HTMLInputElement>("#agenda-date")?.value).toBe("")
      expect(s.trigger().textContent?.trim()).toBe("Todo el personal")
      s.http.expectNone(r => r.url === api)
    }
  )
  it("preserves a pending read through same-session renewal", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    const pending = s.request()
    s.session.next(caller())
    await s.settle()
    expect(pending.cancelled).toBe(false)
    pending.flush([agendaDto()])
    await s.settle()
    expect(s.element.querySelector("[data-agenda-entry]")).not.toBeNull()
  })
  // S5: a blank required date dispatches nothing, on mount and on later control changes.
  it("rejects blank required date without HTTP", async () => {
    const s = await setup()
    await s.field("agenda-date", "")
    await s.field("agenda-view", "week")
    s.http.expectNone(r => r.url.includes("/api/"))
    expect(s.element.querySelector("[data-agenda-entry]")).toBeNull()
    expect(s.element.textContent).toContain("Selecciona una fecha")
  })
  it("dispatches no SSR read or auth initialization even after an explicit date", async () => {
    const s = await setup(true)
    await s.field("agenda-date", "2024-02-29")
    expect(s.authFactory).not.toHaveBeenCalled()
    s.http.expectNone(r => r.url.includes("/api/"))
    expect(s.element.querySelector("[data-agenda-entry]")).toBeNull()
    expect(staffQueries).toEqual([])
  })
  it("dispatches no agenda HTTP for an unauthenticated caller", async () => {
    const s = await setup(false, true)
    await s.field("agenda-date", "2024-02-29")
    s.http.expectNone(r => r.url === api)
    expect(s.element.querySelector("[data-agenda-entry]")).toBeNull()
    expect(staffQueries).toEqual([])
  })
})
