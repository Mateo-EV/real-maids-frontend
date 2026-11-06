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
import { ServiceOrderDetailPage } from "./service-order-detail-page"
import {
  accessText,
  doorText,
  orderDetailApi,
  orderDetailDto,
  sessionDeadline
} from "./service-order-detail-page.testing"

// Local destinations assert links without importing the independent new list leaf
// or activating production routes/guards/toast scopes (parent-owned T6F).
@Component({ selector: "app-test-order-inbox-destination", template: "<p>Bandeja de órdenes</p>" })
class OrderInboxDestination {}
@Component({
  selector: "app-test-order-request-destination",
  template: "<p>Solicitud de origen</p>"
})
class RequestDestination {}

const identity = (id = 19, deadline = sessionDeadline, name = "Session caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, deadline, id)
const subscriptions: Subscription[] = []

async function setup(
  url = "/admin/operations/orders/17",
  options: { server?: boolean; guest?: boolean } = {}
) {
  const session = new BehaviorSubject<AuthSession | null>(options.guest ? null : identity())
  const observeSession = vi.fn(() => session.asObservable())
  const authFactory = vi.fn(() => ({ session: () => session.value }))
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: "admin/operations/orders", component: OrderInboxDestination },
        { path: "admin/operations/orders/:id", component: ServiceOrderDetailPage },
        { path: "admin/operations/order-without-id", component: ServiceOrderDetailPage },
        { path: "admin/operations/requests/:id", component: RequestDestination }
      ]),
      provideOperationsRequestReads(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      { provide: API_URL, useValue: "https://api.example.test" },
      { provide: AuthStore, useFactory: authFactory },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: observeSession } }
    ]
  })
  const http = TestBed.inject(HttpTestingController)
  const store = TestBed.inject(ServiceOrdersStore)
  const router = TestBed.inject(Router)
  const harness = await RouterTestingHarness.create(url)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement!
  const text = () => element().textContent ?? ""
  const pending = (id = 17) => {
    // Immediate missing-GET assertion is intentional RED, not a DOM wait timeout.
    const request = http.expectOne(`${orderDetailApi}/${id}`)
    expect(request.request.method).toBe("GET")
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.transferCache).toBe(false)
    return request
  }
  const navigate = async (target: string) => {
    await router.navigateByUrl(target)
    await settle()
  }
  const retryButton = () => {
    const button = Array.from(element().querySelectorAll<HTMLButtonElement>("button")).find(item =>
      /reintentar/i.test(item.textContent ?? "")
    )
    expect(button, "Visible explicit GET retry").toBeDefined()
    return button!
  }
  const retry = async () => {
    const button = retryButton()
    expect(button.disabled).toBe(false)
    button.click()
    await settle()
  }
  const back = () => {
    const link = Array.from(element().querySelectorAll<HTMLAnchorElement>("a[href]")).find(
      item => new URL(item.href).pathname === "/admin/operations/orders"
    )
    expect(link, "Explicit order inbox return link").toBeDefined()
    expect(link!.textContent).toMatch(/volver/i)
    return link!
  }
  const disclosure = () => {
    const details = Array.from(element().querySelectorAll<HTMLDetailsElement>("details")).find(
      item => /acceso/i.test(item.querySelector("summary")?.textContent ?? "")
    )
    expect(details, "Native property access disclosure").toBeDefined()
    return details!
  }
  const toggle = async (details: HTMLDetailsElement, open: boolean) => {
    details.open = open
    details.dispatchEvent(new Event("toggle"))
    await settle()
  }
  const field = (label: RegExp) => {
    const term = Array.from(element().querySelectorAll("dt")).find(item =>
      label.test(item.textContent ?? "")
    )
    expect(term, `Visible field ${label}`).toBeDefined()
    expect(term!.nextElementSibling?.tagName).toBe("DD")
    return term!.nextElementSibling!.textContent?.trim()
  }
  return {
    http,
    store,
    router,
    harness,
    session,
    observeSession,
    authFactory,
    settle,
    element,
    text,
    pending,
    navigate,
    retry,
    retryButton,
    back,
    disclosure,
    toggle,
    field
  }
}

afterEach(() => {
  try {
    subscriptions.splice(0).forEach(subscription => subscription.unsubscribe())
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
    vi.useRealTimers()
  }
})

// T6E S1/S3/S4/S5/S6: public DOM + real root store/use cases/repository/HTTP.
// These tests do NOT establish protected integration, backend ACL or browser proof.
describe("WP7 T6E read-only order detail leaf RED contract", () => {
  it("observes exactly one detail and renders supplied context without N+1, writes or invented destinations", async () => {
    const app = await setup()
    const read = app.pending()
    expect(app.text()).toMatch(/cargando orden/i)
    expect(app.text()).not.toContain("No registrado")
    read.flush(orderDetailDto())
    await app.settle()
    expect(app.element().querySelector("app-catalog-frame")).not.toBeNull()
    for (const supplied of [
      "OS-DET-17",
      "Estado suministrado",
      "PROGRAMADA",
      "Cliente suministrado",
      "Propiedad suministrada",
      "Servicio suministrado",
      "90",
      "0.00",
      "Alias suministrado",
      "Dirección suministrada",
      "Ciudad suministrada",
      "Región suministrada",
      "33101",
      "12.50",
      "2026-03-02T09:30:00.000Z",
      "UTC",
      "Personal suministrado",
      "Segundo personal",
      "21",
      "22",
      "RESPONSABLE",
      "APOYO_NUEVO",
      "555-0100"
    ])
      expect(app.text()).toContain(supplied)
    expect(app.field(/orden.*\(ID\)/i)).toBe("17")
    expect(app.field(/cliente.*\(ID\)/i)).toBe("8")
    expect(app.field(/propiedad.*\(ID\)/i)).toBe("31")
    expect(app.field(/tipo de servicio.*\(ID\)/i)).toBe("4")
    expect(app.field(/ambientes|habitaciones/i)).toBe("0")
    expect(app.field(/baños/i)).toBe("0")
    expect(app.field(/mascotas/i)).toMatch(/^no$/i)
    expect(app.field(/propiedad.*activ|^activ/i)).toMatch(/inactiva|^no$/i)
    expect(app.text()).not.toContain("Session caller")
    expect(app.element().querySelector("form, input, select, textarea")).toBeNull()
    expect(app.text()).not.toMatch(
      /crear orden|editar orden|cancelar orden|asignar personal|programar orden/i
    )
    expect(
      app.element().querySelector('a[href*="/staff"], a[href*="/customers"], a[href*="/agenda"]')
    ).toBeNull()
    expect(app.text()).not.toMatch(/USD|EUR|\$|hoy|zona horaria/i)
    app.http.expectNone(() => true)
  })

  it("preserves calendar/time nanoseconds, history and schedule backend order without synthetic IDs or totals", async () => {
    const app = await setup()
    app.pending().flush(orderDetailDto())
    await app.settle()
    for (const literal of [
      "2024-02-29",
      "2024-02-28",
      "08:15:00.123456789",
      "10:45:00.987654321",
      "Motivo suministrado",
      "Planificadora suministrada",
      "Actor primero",
      "Actor segundo",
      "2026-03-01T10:00:00.000Z"
    ])
      expect(app.text()).toContain(literal)
    expect(app.text().indexOf("Historia primera")).toBeLessThan(
      app.text().indexOf("Historia segunda")
    )
    const headings = Array.from(app.element().querySelectorAll("h2, h3"))
    const scheduleTitle = headings.find(item => /programaciones/i.test(item.textContent ?? ""))
    expect(scheduleTitle, "Independent schedule-history heading").toBeDefined()
    const scheduleText = scheduleTitle!.parentElement!.textContent ?? ""
    expect(scheduleText.indexOf("2024-02-29")).toBeGreaterThanOrEqual(0)
    expect(scheduleText.indexOf("2024-02-29")).toBeLessThan(scheduleText.indexOf("2024-02-28"))
    expect(app.text()).not.toMatch(
      /total de (estados|programaciones|asignaciones)|historial.*\(ID\)|asignaci[oó]n.*\(ID\)/i
    )
    app.http.expectNone(() => true)
  })

  it("mounts sensitive access text only on explicit native open, escapes it, and unmounts on close without HTTP", async () => {
    const app = await setup()
    app.pending().flush(orderDetailDto())
    await app.settle()
    const details = app.disclosure()
    expect(details.open).toBe(false)
    expect(details.querySelector("summary")?.textContent).not.toContain(accessText)
    expect(app.element().innerHTML).not.toContain("SYNTHETIC ACCESS")
    expect(app.element().innerHTML).not.toContain("SYNTHETIC DOOR")
    await app.toggle(details, true)
    expect(details.textContent).toContain(accessText)
    expect(details.textContent).toContain(doorText)
    expect(details.querySelector("b")).toBeNull()
    expect(
      app
        .element()
        .querySelector('a[href*="SYNTHETIC"], [title*="SYNTHETIC"], [aria-label*="SYNTHETIC"]')
    ).toBeNull()
    await app.toggle(details, false)
    expect(app.element().innerHTML).not.toContain("SYNTHETIC ACCESS")
    expect(app.element().innerHTML).not.toContain("SYNTHETIC DOOR")
    app.http.expectNone(() => true)
  })

  it("renders observations/names as plain text and keeps null, empty text and zero distinct", async () => {
    const app = await setup()
    const dto = orderDetailDto()
    dto.orden.cliente = "<b>Cliente literal</b>"
    dto.orden.montoEstimado = null
    dto.orden.observacion = ""
    dto.orden.idSolicitud = null
    dto.orden.programacion = null
    dto.propiedad.alias = null
    dto.propiedad.areaM2 = null
    dto.propiedad.numeroBanos = null
    dto.propiedad.instruccionesAcceso = null
    dto.propiedad.codigoPuerta = ""
    app.pending().flush(dto)
    await app.settle()
    expect(app.text()).toContain("<b>Cliente literal</b>")
    expect(app.field(/monto estimado/i)).toBe("No registrado")
    expect(app.field(/ambientes|habitaciones/i)).toBe("0")
    expect(app.field(/baños/i)).toBe("No registrado")
    expect(app.field(/área|superficie/i)).toMatch(/^No registrado(?:\s*m²)?$/)
    const observationTitle = Array.from(app.element().querySelectorAll("h2, h3")).find(item =>
      /^observaci[oó]n$/i.test(item.textContent?.trim() ?? "")
    )
    expect(observationTitle).toBeDefined()
    expect(observationTitle!.nextElementSibling?.textContent?.trim()).toBe("")
    await app.toggle(app.disclosure(), true)
    expect(app.field(/instrucciones.*acceso/i)).toBe("No registrado")
    expect(app.field(/c[oó]digo.*puerta/i)).toBe("")
    expect(app.element().querySelector("b")).toBeNull()
    expect(app.element().querySelector('a[href*="/requests/"]')).toBeNull()
    app.http.expectNone(() => true)
  })

  it("escapes unbounded supplied observation without interpreting markup or URLs", async () => {
    const app = await setup()
    app.pending().flush(orderDetailDto())
    await app.settle()
    expect(app.text()).toContain("  <b>Observación literal</b>\nhttps://example.test  ")
    expect(app.element().querySelector('b, a[href="https://example.test"]')).toBeNull()
    app.http.expectNone(() => true)
  })

  it("links only the actual nonnull originating request without carrying order return context", async () => {
    const app = await setup("/admin/operations/orders/17?page=2&size=5")
    app.pending().flush(orderDetailDto())
    await app.settle()
    const link = app
      .element()
      .querySelector<HTMLAnchorElement>('a[href="/admin/operations/requests/42"]')
    expect(link).not.toBeNull()
    link!.click()
    await app.settle()
    expect(app.router.url).toBe("/admin/operations/requests/42")
    expect(app.text()).toContain("Solicitud de origen")
    app.http.expectNone(() => true)
  })

  it("validates positive decimal int32 IDs independently and never dispatches reads for invalid IDs", async () => {
    const app = await setup("/admin/operations/orders/0")
    for (const id of ["0", "-1", "1.5", "1e2", "+17", "17x", "2147483648"]) {
      await app.navigate(`/admin/operations/orders/${encodeURIComponent(id)}`)
      expect(app.text()).toMatch(/identificador de orden inv[aá]lido/i)
      expect(app.text()).not.toContain("No registrado")
      expect(app.element().querySelector("details")).toBeNull()
      app.http.expectNone(() => true)
    }
    await app.navigate("/admin/operations/orders/2147483647?page=bad&size=0")
    app.pending(2147483647).flush(orderDetailDto(2147483647))
    await app.settle()
    expect(app.text()).toContain("OS-DET-2147483647")
    expect(app.back().getAttribute("href")).toBe("/admin/operations/orders?page=0&size=20")
    app.http.expectNone(() => true)
  })

  it("dispatches no read when the public route supplies no owner ID", async () => {
    const app = await setup("/admin/operations/order-without-id?page=2&size=5")
    app.http.expectNone(() => true)
    expect(app.text()).toMatch(/identificador de orden inv[aá]lido/i)
    expect(app.element().querySelector("details")).toBeNull()
    expect(app.back().getAttribute("href")).toBe("/admin/operations/orders?page=2&size=5")
  })

  it("updates query-only history context without restarting pending or verified same-ID reads", async () => {
    const app = await setup("/admin/operations/orders/17?page=2&size=5")
    const pending = app.pending()
    await app.navigate("/admin/operations/orders/17?page=3&size=10")
    expect(pending.cancelled).toBe(false)
    app.http.expectNone(() => true)
    pending.flush(orderDetailDto())
    await app.settle()
    const details = app.disclosure()
    await app.toggle(details, true)
    await app.navigate("/admin/operations/orders/17?page=4&size=5")
    expect(app.text()).toContain("OS-DET-17")
    expect(app.back().getAttribute("href")).toBe("/admin/operations/orders?page=4&size=5")
    expect(app.disclosure()).toBe(details)
    expect(details.open).toBe(true)
    expect(details.textContent).toContain(accessText)
    app.http.expectNone(() => true)
  })

  it("defaults missing, duplicate, malformed and unsafe paging pairs and serializes no PII", async () => {
    const app = await setup()
    app.pending().flush(orderDetailDto())
    await app.settle()
    for (const query of [
      "",
      "?page=2",
      "?size=5",
      "?page=1&page=2&size=5",
      "?page=2&size=5&size=10",
      "?page=-1&size=5",
      "?page=1.5&size=5",
      "?page=1&size=0",
      "?page=2147483648&size=5",
      "?page=2147483647&size=2147483647"
    ]) {
      await app.navigate(`/admin/operations/orders/17${query}`)
      expect(app.back().getAttribute("href")).toBe("/admin/operations/orders?page=0&size=20")
      app.http.expectNone(() => true)
    }
    await app.navigate("/admin/operations/orders/17?page=1&size=200&customerName=private&status=x")
    expect(app.back().getAttribute("href")).toBe("/admin/operations/orders?page=1&size=200")
    app.back().click()
    await app.settle()
    expect(app.router.url).toBe("/admin/operations/orders?page=1&size=200")
    app.http.expectNone(() => true)
  })

  it.each([
    "not-found",
    "forbidden",
    "malformed",
    "wrong-id",
    "crossed-property",
    "crossed-owner"
  ] as const)(
    "keeps %s unverified with safe visible retry, no secrets or fabricated empty records",
    async failure => {
      const app = await setup()
      const request = app.pending()
      const dto = orderDetailDto(failure === "wrong-id" ? 18 : 17)
      if (failure === "not-found" || failure === "forbidden")
        request.flush(
          { mensaje: "Private backend message" },
          { status: failure === "not-found" ? 404 : 403, statusText: "Failure" }
        )
      else {
        if (failure === "crossed-property") dto.propiedad.idPropiedad = 32
        if (failure === "crossed-owner") dto.propiedad.idCliente = 9
        request.flush(failure === "malformed" ? { ...dto, historial: null } : dto)
      }
      await app.settle()
      expect(app.text()).toMatch(
        failure === "not-found"
          ? /no se encontr[oó]/i
          : failure === "forbidden"
            ? /no tienes permiso/i
            : /respuesta.*no es v[aá]lida/i
      )
      expect(app.text()).not.toMatch(
        /Private backend message|OS-DET|No registrado|SYNTHETIC|sin (historial|programaciones)/i
      )
      expect(app.element().querySelector("details")).toBeNull()
      await app.retry()
      app.pending().flush(orderDetailDto())
      await app.settle()
      expect(app.text()).toContain("OS-DET-17")
      app.http.expectNone(() => true)
    }
  )

  it("distinguishes verified empty history, schedules and assignments from unverified failures", async () => {
    const app = await setup()
    const dto = orderDetailDto()
    dto.historial = []
    dto.programaciones = []
    dto.orden.asignados = []
    dto.orden.programacion = null
    app.pending().flush(dto)
    await app.settle()
    expect(app.text()).toMatch(/no se (devolvieron|registraron).*estados|sin historial de estados/i)
    expect(app.text()).toMatch(
      /no se (devolvieron|registraron).*programaciones|sin programaciones/i
    )
    expect(app.text()).toMatch(/no se (devolvi[oó]|registr[oó]).*personal|sin personal asignado/i)
    expect(app.text()).not.toMatch(/sin permisos|restringid|disponibilidad garantizada/i)
    app.http.expectNone(() => true)
  })

  it("reuses a fresh same-ID revisit without polling or renewing its success-only deadline", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    const app = await setup()
    app.pending().flush(orderDetailDto())
    await app.settle()
    const expires = app.store.selectOrder(17).expires
    expect(expires).toBe(31000)
    await app.navigate("/admin/operations/orders")
    now.mockReturnValue(30999)
    await app.navigate("/admin/operations/orders/17")
    expect(app.text()).toContain("OS-DET-17")
    expect(app.store.selectOrder(17).expires).toBe(expires)
    app.http.expectNone(() => true)
    now.mockReturnValue(31000)
    await app.settle()
    app.http.expectNone(() => true) // No polling at expiry while retained.
    await app.navigate("/admin/operations/orders")
    await app.navigate("/admin/operations/orders/17")
    app.pending().flush(orderDetailDto())
    await app.settle()
    expect(app.store.selectOrder(17).expires).toBe(61000)
    app.http.expectNone(() => true)
  })

  it("retains verified same-ID stale data with updating/error and explicit GET-only retry after TTL expiry", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    const app = await setup()
    app.pending().flush(orderDetailDto())
    await app.settle()
    await app.navigate("/admin/operations/orders")
    now.mockReturnValue(31000)
    await app.navigate("/admin/operations/orders/17")
    const refresh = app.pending()
    expect(app.text()).toContain("OS-DET-17")
    expect(app.text()).toMatch(/actualizando orden/i)
    expect(app.disclosure().open).toBe(false)
    refresh.flush({ mensaje: "Private denial" }, { status: 403, statusText: "Forbidden" })
    await app.settle()
    expect(app.text()).toContain("OS-DET-17")
    expect(app.text()).toMatch(/desactualizados/i)
    expect(app.text()).not.toContain("Private denial")
    await app.retry()
    const retry = app.pending()
    expect(app.text()).toMatch(/actualizando orden/i)
    expect(app.text()).toContain("OS-DET-17")
    retry.flush(orderDetailDto())
    await app.settle()
    expect(app.text()).not.toMatch(/desactualizados/i)
    app.http.expectNone(() => true)
  })

  it("cancels a replaced ID immediately and never selects the old owner's record on new loading/error", async () => {
    const app = await setup()
    const old = app.pending()
    await app.navigate("/admin/operations/orders/18")
    expect(old.cancelled).toBe(true)
    expect(() => old.flush(orderDetailDto())).toThrow()
    expect(app.text()).not.toContain("OS-DET-17")
    app.pending(18).flush(orderDetailDto(18))
    await app.settle()
    expect(app.text()).toContain("OS-DET-18")
    await app.navigate("/admin/operations/orders/19")
    expect(app.text()).not.toContain("OS-DET-18")
    app.pending(19).flush({}, { status: 403, statusText: "Forbidden" })
    await app.settle()
    expect(app.text()).not.toMatch(/OS-DET|No registrado|SYNTHETIC/)
    app.http.expectNone(() => true)
  })

  it("fences retained old disclosure events after owner replacement and opens each new owner collapsed", async () => {
    const app = await setup()
    app.pending().flush(orderDetailDto())
    await app.settle()
    const old = app.disclosure()
    await app.toggle(old, true)
    expect(app.text()).toContain(accessText)
    old.open = false // Native closure before queued toggle, then route replacement.
    await app.navigate("/admin/operations/orders/18")
    app.pending(18).flush(orderDetailDto(18))
    await app.settle()
    expect(app.disclosure()).not.toBe(old)
    expect(app.disclosure().open).toBe(false)
    old.open = true
    old.dispatchEvent(new Event("toggle"))
    await app.settle()
    expect(app.element().innerHTML).not.toContain("SYNTHETIC")
    app.http.expectNone(() => true)
  })

  it("checks actual native closed state on retry before a queued toggle and does not remount secrets", async () => {
    const app = await setup()
    app.pending().flush(orderDetailDto())
    await app.settle()
    // Public force observation produces stale-error state without any private cache access.
    const other = app.store.observeOrder(17, true).subscribe()
    subscriptions.push(other)
    app.pending().flush({}, { status: 503, statusText: "Unavailable" })
    await app.settle()
    const details = app.disclosure()
    await app.toggle(details, true)
    expect(details.textContent).toContain(accessText)
    details.open = false
    await app.retry()
    const retry = app.pending()
    expect(app.element().innerHTML).not.toContain("SYNTHETIC")
    details.dispatchEvent(new Event("toggle"))
    await app.settle()
    expect(app.element().innerHTML).not.toContain("SYNTHETIC")
    retry.flush(orderDetailDto())
    await app.settle()
    expect(app.disclosure().open).toBe(false)
    expect(app.element().innerHTML).not.toContain("SYNTHETIC")
    app.http.expectNone(() => true)
  })

  it("releases only its observation on destruction, sharing the root flight with independent consumers", async () => {
    const app = await setup()
    const pending = app.pending()
    const other = app.store.observeOrder(17).subscribe()
    subscriptions.push(other)
    await app.navigate("/admin/operations/orders")
    expect(pending.cancelled).toBe(false)
    pending.flush(orderDetailDto())
    other.unsubscribe()
    await app.navigate("/admin/operations/orders/17")
    expect(app.text()).toContain("OS-DET-17")
    app.http.expectNone(() => true)
  })

  it("cancels its last pending observation on destruction and fences detached retries/toggles", async () => {
    const app = await setup()
    const pending = app.pending()
    await app.navigate("/admin/operations/orders")
    expect(pending.cancelled).toBe(true)
    await app.navigate("/admin/operations/orders/17")
    app.pending().flush(orderDetailDto())
    await app.settle()
    const other = app.store.observeOrder(17, true).subscribe()
    subscriptions.push(other)
    app.pending().flush({}, { status: 503, statusText: "Unavailable" })
    await app.settle()
    const button = app.retryButton()
    const details = app.disclosure()
    await app.navigate("/admin/operations/orders")
    button.click()
    details.open = true
    details.dispatchEvent(new Event("toggle"))
    await app.settle()
    expect(app.text()).not.toMatch(/SYNTHETIC|OS-DET/)
    app.http.expectNone(() => true)
  })

  it.each(["logout", "identity", "deadline", "expiry"] as const)(
    "clears open sensitive DOM and fences queued events/retry on %s without new reads",
    async transition => {
      const now = vi.spyOn(Date, "now").mockReturnValue(1000)
      const app = await setup()
      app.pending().flush(orderDetailDto())
      await app.settle()
      const other = app.store.observeOrder(17, true).subscribe()
      subscriptions.push(other)
      app.pending().flush({}, { status: 503, statusText: "Unavailable" })
      await app.settle()
      const button = app.retryButton()
      const details = app.disclosure()
      await app.toggle(details, true)
      expect(app.text()).toContain(accessText)
      if (transition === "expiry") now.mockReturnValue(sessionDeadline)
      app.session.next(
        transition === "logout"
          ? null
          : transition === "identity"
            ? identity(20)
            : transition === "deadline"
              ? identity(19, sessionDeadline + 1)
              : identity()
      )
      await app.settle()
      expect(app.text()).not.toMatch(/SYNTHETIC|OS-DET/)
      details.open = true
      details.dispatchEvent(new Event("toggle"))
      button.click()
      await app.settle()
      expect(app.element().innerHTML).not.toContain("SYNTHETIC")
      app.http.expectNone(() => true)
    }
  )

  it("cancels in-flight work on session replacement while preserving same-session renewal", async () => {
    const app = await setup()
    const pending = app.pending()
    app.session.next(identity(19, sessionDeadline, "Renewed name"))
    await app.settle()
    expect(pending.cancelled).toBe(false)
    pending.flush(orderDetailDto())
    await app.settle()
    const details = app.disclosure()
    await app.toggle(details, true)
    app.session.next(identity(19, sessionDeadline, "Renewed again"))
    await app.settle()
    expect(app.disclosure()).toBe(details)
    expect(details.textContent).toContain(accessText)
    await app.navigate("/admin/operations/orders/18")
    const next = app.pending(18)
    app.session.next(identity(20))
    await app.settle()
    expect(next.cancelled).toBe(true)
    expect(() => next.flush(orderDetailDto(18))).toThrow()
    expect(app.text()).not.toMatch(/SYNTHETIC|OS-DET/)
    app.http.expectNone(() => true)
  })

  it.each(["server", "guest"] as const)(
    "dispatches no HTTP or protected DOM for %s",
    async mode => {
      const app = await setup("/admin/operations/orders/17", {
        server: mode === "server",
        guest: mode === "guest"
      })
      app.http.expectNone(() => true)
      expect(app.text()).not.toMatch(/SYNTHETIC|OS-DET|No registrado/)
      expect(app.element().querySelector("details")).toBeNull()
      if (mode === "server") {
        expect(app.authFactory).not.toHaveBeenCalled()
        expect(app.observeSession).not.toHaveBeenCalled()
      }
    }
  )
})
