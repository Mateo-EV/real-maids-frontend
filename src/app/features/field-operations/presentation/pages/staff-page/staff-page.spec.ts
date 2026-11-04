import { Component, PLATFORM_ID } from "@angular/core"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { By } from "@angular/platform-browser"
import { provideRouter, Router, RouterLink } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideFieldOperationsReads } from "../../../field-operations.providers"
import { FieldStaffStore } from "../../state/field-staff.store"
import { StaffPage } from "./staff-page"

const api = "http://localhost:8080/api/personal"
const deadline = 4102444800000
const owner = { userId: 19, sessionDeadline: deadline }
const dto = (id = 7, name = "Nombre real", active = false) => ({
  idPersonal: id,
  nombre: name,
  documento: `DOC-${id}`,
  telefono: null,
  correo: null,
  idioma: "es",
  fechaIngreso: null,
  activo: active,
  idUsuario: null,
  disponibilidad: [],
  fechaCreacion: "2026-01-01T12:00:00-05:00"
})
const page = (records = [dto()], pagina = 0, tamanio = 20, totalElementos = 45) => {
  // The real HTTP adapter requires complete pages (except the final/out-of-range page).
  const count = Math.min(tamanio, Math.max(0, totalElementos - pagina * tamanio))
  const contenido = [...records]
  for (let i = records.length; i < count; i++)
    contenido.push(dto(100 + i, `Personal ${100 + i}`, true))
  return {
    contenido,
    pagina,
    tamanio,
    totalElementos,
    totalPaginas: Math.ceil(totalElementos / tamanio)
  }
}

@Component({ template: "" })
class NavigationTarget {}

async function setup(options: { url?: string; state?: object; server?: boolean } = {}) {
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Caller", "caller@example.test", null, deadline, owner.userId)
  )
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideFieldOperationsReads(),
      provideRouter([
        { path: "admin/staff", component: StaffPage },
        { path: "admin/staff/me", component: NavigationTarget },
        { path: "admin/staff/:id", component: NavigationTarget }
      ]),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
      ...(options.server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const harness = await RouterTestingHarness.create()
  await TestBed.inject(Router).navigateByUrl(options.url ?? "/admin/staff", {
    state: options.state
  })
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = harness.routeNativeElement!
  const http = TestBed.inject(HttpTestingController)
  const request = (pagina = 0, tamanio = 20, search?: string, active?: boolean) => {
    const req = http.expectOne(
      r =>
        r.url === api &&
        r.params.get("pagina") === String(pagina) &&
        r.params.get("tamanio") === String(tamanio) &&
        r.params.get("busqueda") === (search ?? null) &&
        r.params.get("activo") === (active === undefined ? null : String(active))
    )
    expect(req.request.method).toBe("GET")
    expect(req.request.transferCache).toBe(false)
    return req
  }
  const click = async (label: string) => {
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  return { harness, element, http, request, settle, click, session }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

// WP7 T4 / S1,S3: public DOM/HTTP evidence with the real root read boundary.
describe("StaffPage read-only directory", () => {
  it("keeps root selectors pure and dispatches no writes or initial profile/lookups", async () => {
    const s = await setup()
    const store = TestBed.inject(FieldStaffStore)
    expect(s.harness.routeDebugElement!.injector.get(FieldStaffStore)).toBe(store)
    store.selectStaff()
    store.selectStaffById(7)
    store.selectMyStaffProfile()
    const pending = s.http.match(() => true)
    expect(pending.every(r => r.request.method === "GET" && r.request.url === api)).toBe(true)
    expect(pending.length).toBeLessThanOrEqual(1)
    pending.forEach(r => r.flush(page([], 0, 20, 0)))
    await s.settle()
    expect(s.element.textContent).not.toMatch(/Crear personal|Editar personal|Eliminar|KPI/)
  })

  it("dispatches no staff HTTP during server rendering", async () => {
    const s = await setup({ server: true })
    s.http.expectNone(() => true)
  })

  it("starts with one page 0/20 GET and distinguishes loading from verified empty", async () => {
    const s = await setup()
    const req = s.request()
    expect(s.element.textContent).toMatch(/Cargando personal/)
    expect(s.element.textContent).not.toMatch(/No hay personal/)
    req.flush(page([], 0, 20, 0))
    await s.settle()
    expect(s.element.textContent).toMatch(/No hay personal/)
    expect(s.element.textContent).not.toMatch(/Cargando personal/)
  })

  it("renders server records without slicing and navigates with effective size and server totals", async () => {
    const s = await setup({ url: "/admin/staff?page=2&size=20" })
    s.request(2).flush(page([dto(), dto(8, "Otro nombre", true)], 2, 5, 45))
    await s.settle()
    expect(s.element.querySelector("app-catalog-frame")).not.toBeNull()
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const records = s.element.querySelector(selector)
      expect(records, selector).not.toBeNull()
      expect(records!.textContent).toContain("Otro nombre")
      expect(records!.textContent).toContain("DOC-7")
      expect(records!.textContent).toMatch(/Inactivo/)
      expect(records!.textContent).toMatch(/Activo/)
      const link = records!.querySelector<HTMLAnchorElement>('a[href^="/admin/staff/7?"]')
      expect(link?.textContent?.trim()).toBe("Nombre real")
      expect(link?.getAttribute("href")).toBe("/admin/staff/7?page=2&size=5")
    }
    expect(s.element.querySelectorAll("[catalogDesktop] tbody tr")).toHaveLength(5)
    expect(s.element.querySelectorAll("[catalogMobile] > li")).toHaveLength(5)
    expect(s.element.textContent).toContain("11–15 de 45")
    expect(s.element.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe("3")
    await s.click("Página siguiente")
    s.request(3, 5).flush(page([dto(9)], 3, 5, 45))
    await s.settle()
    await s.click("Página anterior")
    // Effective 10/5 is a different root key from the original requested 40/20.
    // Do not require the page to alias root cache keys or copy cached results.
    s.request(2, 5).flush(page([dto(), dto(8, "Otro nombre", true)], 2, 5, 45))
    await s.settle()
    expect(s.element.textContent).toContain("Otro nombre")
  })

  it("offers only documented name/document search and active filtering, debounced and server-owned", async () => {
    const s = await setup()
    s.request().flush(page())
    await s.settle()
    const input = s.element.querySelector<HTMLInputElement>('input[type="search"]')
    expect(input).not.toBeNull()
    const label = Array.from(input!.labels ?? [])
      .map(l => l.textContent)
      .join(" ")
    expect(label).toMatch(/nombre.*documento/i)
    expect(label).not.toMatch(/correo|email/i)
    const select = s.element.querySelector<HTMLSelectElement>("select")
    expect(select).not.toBeNull()
    expect(
      Array.from(select!.labels ?? [])
        .map(l => l.textContent)
        .join(" ")
    ).toMatch(/estado/i)
    expect(Array.from(select!.options).map(o => o.textContent?.trim())).toEqual([
      "Todos",
      "Activos",
      "Inactivos"
    ])
    input!.value = "  DOC-7  "
    input!.dispatchEvent(new Event("input", { bubbles: true }))
    s.harness.detectChanges()
    s.http.expectNone(r => r.url === api)
    await new Promise(resolve => setTimeout(resolve, 300))
    await s.settle()
    s.request(0, 20, "DOC-7").flush(page())
    await s.settle()
    select!.value = Array.from(select!.options).find(
      o => o.textContent?.trim() === "Inactivos"
    )!.value
    select!.dispatchEvent(new Event("change", { bubbles: true }))
    await s.settle()
    expect(s.element.textContent).not.toContain("Nombre real")
    s.request(0, 20, "DOC-7", false).flush(page())
    await s.settle()
    expect(s.element.textContent).toContain("Nombre real")
    expect(s.element.querySelectorAll("input, select")).toHaveLength(2)
    expect(s.element.textContent).not.toMatch(/Crear personal|Editar personal|Eliminar/)
  })

  it("carries owner-bound search/false only in link state, with effective page/size in detail and own URLs", async () => {
    const s = await setup({
      url: "/admin/staff?page=2&size=20",
      state: { staffReturn: { ...owner, search: " DOC-7 ", isActive: false } }
    })
    s.request(2, 20, "DOC-7", false).flush(page([dto()], 2, 5, 45))
    await s.settle()
    const links = s.harness.routeDebugElement!.queryAll(By.directive(RouterLink))
    for (const path of ["/admin/staff/7", "/admin/staff/me"]) {
      const matching = links.filter(link =>
        (link.nativeElement as HTMLAnchorElement).getAttribute("href")?.startsWith(`${path}?`)
      )
      expect(matching.length, path).toBeGreaterThanOrEqual(path.endsWith("/7") ? 2 : 1)
      for (const link of matching) {
        expect((link.nativeElement as HTMLAnchorElement).getAttribute("href")).toBe(
          `${path}?page=2&size=5`
        )
        expect(link.injector.get(RouterLink).state).toEqual({
          staffReturn: { ...owner, search: "DOC-7", isActive: false }
        })
      }
    }
    expect(s.element.querySelector('a[href^="/admin/staff/me"]')?.textContent).toMatch(/Mi ficha/)
  })

  it("ignores another owner's navigation filters before its first read", async () => {
    const s = await setup({
      state: { staffReturn: { ...owner, userId: 20, search: "DOC-7", isActive: false } }
    })
    s.request().flush(page([], 0, 20, 0))
    await s.settle()
  })

  it("shows safe retryable initial errors without false empty or raw backend text", async () => {
    const s = await setup()
    s.request().flush({ mensaje: "RAW INTERNAL DETAIL" }, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/permiso/i)
    expect(s.element.textContent).not.toMatch(/No hay personal|RAW INTERNAL DETAIL/)
    await s.click("Reintentar")
    s.request().flush(page())
    await s.settle()
    expect(s.element.textContent).toContain("Nombre real")
  })

  it("retains only verified same-query rows on expired revisit and failed revalidation", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    s.request().flush(page())
    await s.settle()
    await s.click("Página siguiente")
    expect(s.element.textContent).not.toContain("Nombre real")
    s.request(1).flush(page([dto(8, "Otra página")], 1))
    await s.settle()
    clock.mockReturnValue(121000)
    await s.click("Página anterior")
    const refresh = s.request()
    expect(s.element.textContent).toContain("Nombre real")
    expect(s.element.textContent).not.toContain("Otra página")
    expect(s.element.textContent).toMatch(/Actualizando personal/)
    refresh.error(new ProgressEvent("error"))
    await s.settle()
    expect(s.element.textContent).toContain("Nombre real")
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/desactualizados/i)
    await s.click("Reintentar")
    s.request().flush(page())
    await s.settle()
  })

  it("clamps positive-total out-of-range emptiness once using returned effective size, never loops", async () => {
    const s = await setup({ url: "/admin/staff?page=4&size=20" })
    s.request(4).flush(page([], 4, 5, 7))
    await s.settle()
    s.request(1, 5).flush(page([], 1, 5, 3))
    await s.settle()
    s.http.expectNone(r => r.url === api)
    expect(
      TestBed.inject(FieldStaffStore).selectStaff({ offset: 80, limit: 20 }).result
    ).toMatchObject({ offset: 20, limit: 5, total: 7, items: [] })
  })

  it("uses the effective limit when filters reset to page zero, without locally filtering returned rows", async () => {
    const s = await setup({ url: "/admin/staff?page=2&size=20" })
    s.request(2).flush(page([dto()], 2, 5, 45))
    await s.settle()
    const select = s.element.querySelector<HTMLSelectElement>("select")!
    select.value = "true"
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await s.settle()
    s.request(0, 5, undefined, true).flush(page([dto(8, "Nombre literal", false)], 0, 5, 1))
    await s.settle()
    // Backend supplies the records; the page must not apply a second active filter.
    expect(s.element.textContent).toContain("Nombre literal")
    expect(s.element.textContent).toContain("Inactivo")
    expect(s.element.textContent).toContain("1–1 de 1")
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("debounces to the latest search and cancels the obsolete consumer-owned read", async () => {
    const s = await setup()
    const obsolete = s.request()
    const input = s.element.querySelector<HTMLInputElement>('input[type="search"]')!
    for (const value of ["Primer nombre", "  DOC-8  "]) {
      input.value = value
      input.dispatchEvent(new Event("input", { bubbles: true }))
    }
    s.harness.detectChanges()
    s.http.expectNone(() => true)
    expect(obsolete.cancelled).toBe(false)
    await new Promise(resolve => setTimeout(resolve, 300))
    await s.settle()
    expect(obsolete.cancelled).toBe(true)
    s.request(0, 20, "DOC-8").flush(page([dto(8)], 0, 20, 1))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("cancels a pending read on destruction and never dispatches a queued search", async () => {
    const s = await setup()
    const pending = s.request()
    const input = s.element.querySelector<HTMLInputElement>('input[type="search"]')!
    input.value = "Discarded search"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    s.harness.fixture.destroy()
    expect(pending.cancelled).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 300))
    s.http.expectNone(() => true)
    expect(TestBed.inject(FieldStaffStore).selectStaff().result).toBeUndefined()
  })

  it("destroying this page releases only its subscription, not another root consumer", async () => {
    const s = await setup()
    const store = TestBed.inject(FieldStaffStore)
    const other = store.observeStaff({ offset: 0, limit: 20 }).subscribe()
    const pending = s.request()
    s.harness.fixture.destroy()
    expect(pending.cancelled).toBe(false)
    pending.flush(page())
    expect(store.selectStaff().result?.items[0].name).toBe("Nombre real")
    other.unsubscribe()
    s.http.expectNone(() => true)
  })

  it("preserves controls, pending work and return ownership across same-session renewal", async () => {
    const s = await setup({
      state: { staffReturn: { ...owner, search: "DOC-7", isActive: false } }
    })
    const pending = s.request(0, 20, "DOC-7", false)
    s.session.next(AuthSession.create("Renewed caller", "caller@example.test", null, deadline, 19))
    await s.settle()
    expect(pending.cancelled).toBe(false)
    s.http.expectNone(() => true)
    pending.flush(page())
    await s.settle()
    expect(s.element.querySelector<HTMLInputElement>('input[type="search"]')?.value).toBe("DOC-7")
    expect(s.element.querySelector<HTMLSelectElement>("select")?.value).toBe("false")
    const own = s.harness
      .routeDebugElement!.queryAll(By.directive(RouterLink))
      .find(link =>
        (link.nativeElement as HTMLAnchorElement)
          .getAttribute("href")
          ?.startsWith("/admin/staff/me?")
      )!
    expect(own.injector.get(RouterLink).state).toEqual({
      staffReturn: { ...owner, search: "DOC-7", isActive: false }
    })
  })

  it("replaces session context, cancels old reads and fences the old debounced search", async () => {
    const s = await setup({
      state: { staffReturn: { ...owner, search: "DOC-7", isActive: false } }
    })
    const pending = s.request(0, 20, "DOC-7", false)
    const input = s.element.querySelector<HTMLInputElement>('input[type="search"]')!
    input.value = "Old owner's draft"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    s.session.next(
      AuthSession.create("Replacement", "replacement@example.test", null, deadline + 1, 20)
    )
    await s.settle()
    expect(pending.cancelled).toBe(true)
    expect(input.value).toBe("")
    expect(s.element.querySelector<HTMLSelectElement>("select")?.value).toBe("all")
    s.request().flush(page([dto(8, "Replacement record")]))
    await s.settle()
    await new Promise(resolve => setTimeout(resolve, 300))
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.element.textContent).toContain("Replacement record")
    expect(s.element.textContent).not.toContain("Nombre real")
    expect(
      TestBed.inject(FieldStaffStore).selectStaff({ search: "DOC-7", isActive: false }).result
    ).toBeUndefined()
    const own = s.harness
      .routeDebugElement!.queryAll(By.directive(RouterLink))
      .find(link =>
        (link.nativeElement as HTMLAnchorElement)
          .getAttribute("href")
          ?.startsWith("/admin/staff/me?")
      )!
    expect(own.injector.get(RouterLink).state).toEqual({
      staffReturn: { userId: 20, sessionDeadline: deadline + 1, search: "", isActive: null }
    })
  })

  it("fences a queued clamp on logout and clears verified records without another read", async () => {
    const s = await setup({ url: "/admin/staff?page=4&size=20" })
    s.request(4).flush(page([], 4, 5, 7))
    s.session.next(null)
    await s.settle()
    s.http.expectNone(() => true)
    expect(
      TestBed.inject(FieldStaffStore).selectStaff({ offset: 80, limit: 20 }).result
    ).toBeUndefined()
    expect(s.element.querySelector("[catalogDesktop]")).toBeNull()
    expect(s.element.querySelector("[catalogMobile]")).toBeNull()
  })

  it("fences a queued clamp after a newer explicit filter change", async () => {
    const s = await setup({ url: "/admin/staff?page=4&size=20" })
    s.request(4).flush(page([], 4, 5, 7))
    s.harness.detectChanges()
    // Out-of-range current pages have no numeric navigation tokens. Use the
    // available public filter to supersede recovery before its microtask runs.
    const select = s.element.querySelector<HTMLSelectElement>("select")!
    expect(select).not.toBeNull()
    select.value = "false"
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await s.settle()
    s.request(0, 5, undefined, false).flush(page([], 0, 5, 0))
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.element.textContent).toContain("No hay personal")
  })

  it("fences a queued clamp when the page is destroyed", async () => {
    const s = await setup({ url: "/admin/staff?page=4&size=20" })
    s.request(4).flush(page([], 4, 5, 7))
    s.harness.fixture.destroy()
    await Promise.resolve()
    s.http.expectNone(() => true)
    // Destruction does not rewrite the verified server response in the root store.
    expect(
      TestBed.inject(FieldStaffStore).selectStaff({ offset: 80, limit: 20 }).result
    ).toMatchObject({ offset: 20, limit: 5, total: 7, items: [] })
  })

  it.each(["?page=2", "?page=2&size=5&size=10", "?page=-1&size=5"])(
    "defaults malformed paired paging %s before the first HTTP read",
    async suffix => {
      const s = await setup({ url: `/admin/staff${suffix}` })
      s.request().flush(page([], 0, 20, 0))
      await s.settle()
      s.http.expectNone(() => true)
    }
  )

  it("preserves literal names and nullable contacts in both record presentations", async () => {
    const s = await setup()
    s.request().flush(page([dto(7, "<b>Nombre literal</b>")], 0, 20, 1))
    await s.settle()
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const records = s.element.querySelector(selector)!
      expect(records.textContent).toContain("<b>Nombre literal</b>")
      expect(records.textContent).toContain("No registrado")
      expect(records.textContent).toContain("es")
      expect(records.querySelector("b")).toBeNull()
    }
    s.http.expectNone(() => true)
  })

  it("renders unavailable admission without mutating pinned entries or making a write", async () => {
    const s = await setup()
    s.request().flush(page())
    await s.settle()
    const store = TestBed.inject(FieldStaffStore)
    const pins = Array.from({ length: 19 }, (_, i) =>
      store.observeStaff({ search: `Pinned-${i}` }).subscribe()
    )
    for (let i = 0; i < 19; i++) s.request(0, 20, `Pinned-${i}`).flush(page())
    // Keep the original key pinned when this page switches to its twenty-first key.
    const original = store.observeStaff().subscribe()
    const originalResult = store.selectStaff().result
    const input = s.element.querySelector<HTMLInputElement>('input[type="search"]')!
    input.value = "Cannot admit"
    input.dispatchEvent(new Event("input", { bubbles: true }))
    await new Promise(resolve => setTimeout(resolve, 300))
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.element.querySelector('[role="alert"]')?.textContent).toMatch(/iniciar la consulta/i)
    expect(s.element.textContent).not.toMatch(/Nombre real|No hay personal/)
    expect(store.selectStaff().result).toBe(originalResult)
    expect(store.selectStaff({ search: "Cannot admit" }).result).toBeUndefined()
    original.unsubscribe()
    pins.forEach(pin => pin.unsubscribe())
  })
})
