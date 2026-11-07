import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideOperationsRequestReads } from "../../../operations.providers"
import { AgendaStore } from "../../state/agenda.store"
import { agendaDto } from "../../state/agenda.testing"
import { AgendaPage } from "./agenda-page"

@Component({ selector: "app-agenda-test-destination", template: "Destination" })
class Destination {}
const api = "https://api.example.test/api/agenda"
const caller = (id = 19, deadline = 4102444800000) =>
  AuthSession.create("Caller", `caller${id}@example.test`, null, deadline, id)
async function setup(server = false, guest = false) {
  const session = new BehaviorSubject<AuthSession | null>(guest ? null : caller())
  const authFactory = vi.fn(() => ({ session: () => session.value }))
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
  return { harness, element, http, settle, field, click, request, session, authFactory }
}
afterEach(() => {
  TestBed.inject(HttpTestingController).verify()
  vi.restoreAllMocks()
})

// T7C / S1,S2,S3,S4,S6,S8,S9,S10: real repository/source HTTP and public DOM.
describe("AgendaPage explicit day/seven-day/month consumer", () => {
  it("starts blank, initializes neither auth nor HTTP and owns its finite store locally", async () => {
    const s = await setup()
    expect(s.element.querySelector<HTMLInputElement>("#agenda-date")?.value).toBe("")
    expect(s.element.textContent).toContain("Selecciona una fecha")
    expect(s.element.querySelector("app-catalog-frame")).not.toBeNull()
    expect(TestBed.inject(AgendaStore, null)).toBeNull()
    expect(s.authFactory).not.toHaveBeenCalled()
    s.http.expectNone(r => r.url.includes("/api/"))
    expect(
      s.element.querySelector('a[href="/admin/operations/agenda"]')?.getAttribute("aria-current")
    ).toBe("page")
    expect(
      s.element.querySelector('a[href="/admin/operations/requests"]')?.textContent?.trim()
    ).toBe("Solicitudes")
    expect(s.element.querySelector('a[href="/admin/operations/orders"]')?.textContent?.trim()).toBe(
      "Órdenes"
    )
  })
  it.each([
    ["day", "2024-02-29", "2024-02-29", "Día"],
    ["week", "2024-02-29", "2024-03-06", "7 días desde la fecha seleccionada"],
    ["month", "2024-02-01", "2024-02-29", "Mes completo"]
  ] as const)(
    "queries the explicit %s window without date defaults or inferred staff",
    async (view, from, until, label) => {
      const s = await setup()
      await s.field("agenda-date", "2024-02-29")
      await s.field("agenda-view", view)
      s.http.expectNone(r => r.url === api)
      await s.click("Consultar agenda")
      expect(s.element.textContent).toContain("Cargando agenda")
      s.request(from, until).flush([agendaDto()])
      await s.settle()
      expect(
        s.element.querySelector('section[aria-label="Programación consultada"] h2')?.textContent
      ).toContain(label)
      expect(s.element.querySelectorAll("[data-agenda-day]")).toHaveLength(
        view === "day" ? 1 : view === "week" ? 7 : 29
      )
      expect(s.element.querySelector("[data-agenda-entry] time")?.textContent).toBe("2024-02-29")
      expect(s.element.textContent).toContain(from)
      expect(s.element.textContent).toContain(until)
      expect(s.element.querySelector('a[href="/admin/operations/orders/17"]')).not.toBeNull()
      s.http.expectNone(r => r.method !== "GET")
    }
  )
  it("sends an explicit staff filter but displays actual different staff returned by own-scope backend", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    await s.field("agenda-staff", "77")
    await s.click("Consultar agenda")
    s.request("2024-02-29", "2024-02-29", "77").flush([agendaDto()])
    await s.settle()
    expect(s.element.textContent).toContain("Personal suministrado")
    expect(s.element.textContent).toContain("ID 9")
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
  })
  it("renders literal clocks/null/plain text/server order and links only actual order IDs", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    await s.click("Consultar agenda")
    const first = agendaDto(22),
      second = agendaDto(17)
    first.cliente = "<img src=x onerror=alert(1)>"
    first.codigo = "  OS-22  "
    s.request().flush([first, second])
    await s.settle()
    const entries = Array.from(s.element.querySelectorAll<HTMLElement>("[data-agenda-entry]"))
    expect(entries).toHaveLength(2)
    expect(entries[0].querySelector("a")?.getAttribute("href")).toBe("/admin/operations/orders/22")
    expect(entries[1].querySelector("a")?.getAttribute("href")).toBe("/admin/operations/orders/17")
    expect(entries[0].textContent).toContain("08:15:49.123456789")
    expect(entries[0].textContent).toContain("No registrado")
    expect(entries[0].textContent).toContain(first.cliente)
    expect(entries[0].querySelector("img")).toBeNull()
    entries[0].querySelector<HTMLAnchorElement>("a")!.click()
    await s.settle()
    expect(TestBed.inject(Router).url).toBe("/admin/operations/orders/22")
    s.http.expectNone(r => r.method !== "GET")
  })
  it("distinguishes verified empty from initial unverified state", async () => {
    const s = await setup()
    expect(s.element.textContent).not.toContain("No se devolvieron servicios")
    await s.field("agenda-date", "2024-02-29")
    await s.click("Consultar agenda")
    s.request().flush([])
    await s.settle()
    expect(s.element.textContent).toContain("No se devolvieron servicios")
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
  })
  it("preserves same-query verified rows on retry failure and retries only GET", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    await s.click("Consultar agenda")
    s.request().flush([agendaDto()])
    await s.settle()
    await s.click("Consultar agenda")
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
    // Editing the draft does not change the failed applied query for Retry.
    await s.field("agenda-date", "2024-03-01")
    await s.click("Reintentar")
    s.request().flush([agendaDto(18)])
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')).toBeNull()
    expect(s.element.querySelector('a[href="/admin/operations/orders/18"]')).not.toBeNull()
    s.http.expectNone(r => r.method !== "GET")
  })
  it("cancels superseded query HTTP and hides unrelated rows immediately", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    await s.click("Consultar agenda")
    s.request().flush([agendaDto()])
    await s.settle()
    await s.click("Consultar agenda")
    const old = s.request()
    await s.field("agenda-date", "2024-03-01")
    await s.click("Consultar agenda")
    expect(old.cancelled).toBe(true)
    expect(s.element.querySelector("[data-agenda-entry]")).toBeNull()
    s.request("2024-03-01").flush([], { status: 200, statusText: "OK" })
    await s.settle()
    expect(s.element.querySelector('a[href="/admin/operations/orders/17"]')).toBeNull()
  })
  it("cancels finite GET on page destruction and revisits with blank controls/no cross-visit data", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    await s.click("Consultar agenda")
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
      await s.click("Consultar agenda")
      s.request().flush([agendaDto()])
      await s.settle()
      await s.click("Consultar agenda")
      const pending = s.request()
      s.session.next(next)
      await s.settle()
      expect(pending.cancelled).toBe(true)
      expect(s.element.querySelector("[data-agenda-entry]")).toBeNull()
      s.http.expectNone(r => r.url === api)
    }
  )
  it("preserves a pending read through same-session renewal", async () => {
    const s = await setup()
    await s.field("agenda-date", "2024-02-29")
    await s.click("Consultar agenda")
    const pending = s.request()
    s.session.next(caller())
    await s.settle()
    expect(pending.cancelled).toBe(false)
    pending.flush([agendaDto()])
    await s.settle()
    expect(s.element.querySelector("[data-agenda-entry]")).not.toBeNull()
  })
  it.each(["0", "-1", "1.5", "2147483648", "abc"])(
    "rejects invalid staff %s with no HTTP/read/write effects",
    async staff => {
      const s = await setup()
      await s.field("agenda-date", "2024-02-29")
      await s.field("agenda-staff", staff)
      const button = s.element.querySelector<HTMLButtonElement>('button[type="submit"]')!
      expect(button.disabled).toBe(true)
      s.element
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await s.settle()
      s.http.expectNone(r => r.url.includes("/api/"))
      expect(s.element.querySelector("[data-agenda-entry]")).toBeNull()
      expect(s.element.textContent).toContain("entero positivo")
    }
  )
  it("rejects blank required date without HTTP", async () => {
    const s = await setup()
    expect(s.element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
    s.element
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await s.settle()
    s.http.expectNone(r => r.url.includes("/api/"))
    expect(s.authFactory).not.toHaveBeenCalled()
  })
  it("dispatches no SSR read or auth initialization even after explicit form submission", async () => {
    const s = await setup(true)
    await s.field("agenda-date", "2024-02-29")
    await s.click("Consultar agenda")
    expect(s.authFactory).not.toHaveBeenCalled()
    s.http.expectNone(r => r.url.includes("/api/"))
    expect(s.element.querySelector("[data-agenda-entry]")).toBeNull()
  })
  it("dispatches no agenda HTTP for an unauthenticated caller", async () => {
    const s = await setup(false, true)
    await s.field("agenda-date", "2024-02-29")
    await s.click("Consultar agenda")
    s.http.expectNone(r => r.url === api)
    expect(s.element.querySelector("[data-agenda-entry]")).toBeNull()
  })
})
