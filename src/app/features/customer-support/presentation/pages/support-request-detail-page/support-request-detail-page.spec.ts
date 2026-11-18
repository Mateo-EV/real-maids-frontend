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
import { provideCustomerSupportReads } from "../../../customer-support.providers"
import { SupportRequestDetailPage } from "./support-request-detail-page"

// Destination only: no peer inbox import or production route/provider change.
@Component({ template: "<p>Bandeja de soporte</p>" })
class SupportInboxDestination {}

const api = "https://api.example.test/api/atenciones"
const deadline = 4102444800000
const identity = (id = 19, expires = deadline, name = "Session caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, expires, id)

const requestDto = (id = 17, overrides: Record<string, unknown> = {}) => ({
  idAtencion: id,
  idCliente: 8,
  cliente: "Cliente autorizado",
  idOrden: 41,
  codigoOrden: "ORD-41",
  idTipo: 4,
  tipo: "Consulta",
  requiereRespuesta: true,
  estado: "RECIBIDA",
  estadoNombre: "Recibida",
  asunto: "No puedo ver mi factura",
  descripcion: "Descripción literal de la atención",
  fechaRegistro: "2026-03-02T04:30:00-05:00",
  fechaCierre: null as string | null,
  ...overrides
})

const followUpDto = (
  id: number,
  autor: string | null,
  delCliente: boolean,
  mensaje: string,
  fecha = "2026-03-03T09:00:00Z"
) => ({ idSeguimiento: id, autor, delCliente, mensaje, fecha })

const detailDto = (
  id = 17,
  overrides: Record<string, unknown> = {},
  followUps = [followUpDto(90, "Agente de soporte", false, "Revisando el caso")]
) => ({ atencion: requestDto(id, overrides), seguimiento: followUps })

async function setup(
  url = "/admin/support/17",
  options: { server?: boolean; guest?: boolean } = {}
) {
  const session = new BehaviorSubject<AuthSession | null>(options.guest ? null : identity())
  const observeSession = vi.fn(() => session.asObservable())
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        { path: "admin/support", component: SupportInboxDestination },
        { path: "admin/support/:id", component: SupportRequestDetailPage }
      ]),
      provideCustomerSupportReads(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      { provide: API_URL, useValue: "https://api.example.test" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: observeSession } }
    ]
  })
  const http = TestBed.inject(HttpTestingController)
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
    const request = http.expectOne(`${api}/${id}`)
    expect(request.request.method).toBe("GET")
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.transferCache).toBe(false)
    return request
  }
  const navigate = async (target: string) => {
    await router.navigateByUrl(target)
    await settle()
  }
  const retry = async () => {
    const button = Array.from(element().querySelectorAll<HTMLButtonElement>("button")).find(item =>
      /reintentar/i.test(item.textContent ?? "")
    )
    expect(button, "Visible explicit retry action").toBeDefined()
    expect(button!.disabled).toBe(false)
    button!.click()
    await settle()
  }
  const links = () =>
    Array.from(element().querySelectorAll<HTMLAnchorElement>("a[href]")).map(link => ({
      path: new URL(link.href).pathname,
      search: new URL(link.href).search,
      label: (link.textContent ?? "").trim()
    }))
  const timeline = () => Array.from(element().querySelectorAll<HTMLElement>("[data-follow-up-id]"))
  return {
    http,
    router,
    harness,
    session,
    observeSession,
    settle,
    element,
    text,
    pending,
    navigate,
    retry,
    links,
    timeline
  }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
    vi.useRealTimers()
  }
})

// WP8 T5 / S7, S11: the staff detail leaf consumer. Route wiring and inbox links are
// asserted separately, so this file never claims live backend or browser acceptance.
describe("SupportRequestDetailPage", () => {
  it("reads one matching request and renders the supplied header, state and description", async () => {
    const app = await setup()
    expect(app.text()).toMatch(/cargando atenci[oó]n/i)
    expect(app.text()).not.toContain("Cliente autorizado")

    app.pending().flush(detailDto())
    await app.settle()

    const heading = app.element().querySelector("#support-detail-subject")
    expect(heading?.textContent).toContain("No puedo ver mi factura")
    expect(app.text()).toContain("Cliente autorizado")
    expect(app.text()).toContain("Consulta")
    // S4: the badge carries the code and the supplied name, never colour alone.
    const badge = app.element().querySelector("[data-support-state]")
    expect(badge?.textContent).toContain("RECIBIDA · Recibida")
    expect(app.text()).toContain("Sí, requiere respuesta")
    // Literal instants, labelled UTC, never re-zoned into a local date.
    expect(app.text()).toContain("2026-03-02T09:30:00.000Z")
    expect(app.text()).toContain("UTC")
    // Nullable closure stays explicit instead of being invented.
    expect(app.text()).toContain("No registrado")
    expect(app.text()).toContain("Descripción literal de la atención")
    // Read-only consumer: no write affordance and no unrelated module link.
    expect(
      app.element().querySelector("form, input, select, textarea, button[type=submit]")
    ).toBeNull()
    expect(app.text()).toContain("Revisando el caso")
    app.http.expectNone(() => true)
  })

  it("dispatches no read at all for an id that is not a positive int32", async () => {
    const app = await setup("/admin/support/0")
    for (const id of ["0", "-1", "1.5", "1e2", "+17", "17x", "abc", "2147483648"]) {
      await app.navigate(`/admin/support/${encodeURIComponent(id)}`)
      expect(app.text(), id).toMatch(/identificador de atenci[oó]n inv[aá]lido/i)
      expect(app.text(), id).not.toContain("Cliente autorizado")
      expect(app.text(), id).not.toMatch(/cargando atenci[oó]n/i)
      app.http.expectNone(() => true)
    }
    // The decimal int32 upper boundary is a valid id, not an arbitrary UI cap.
    await app.navigate("/admin/support/2147483647")
    app.pending(2147483647).flush(detailDto(2147483647))
    await app.settle()
    expect(app.text()).toContain("2147483647")
    app.http.expectNone(() => true)
  })

  it("keeps the follow-up timeline in server order with literal text and instants", async () => {
    const app = await setup()
    app
      .pending()
      .flush(
        detailDto(17, {}, [
          followUpDto(93, "Agente tres", false, "Tercero por fecha", "2026-03-05T12:00:00Z"),
          followUpDto(91, "Agente uno", false, "<b>Primero literal</b>", "2026-03-03T09:00:00Z"),
          followUpDto(92, null, true, "Segundo literal\nsegunda línea", "2026-03-04T09:00:00Z")
        ])
      )
    await app.settle()

    const items = app.timeline()
    expect(items.map(item => item.dataset["followUpId"])).toEqual(["93", "91", "92"])
    expect(items.map(item => item.textContent)).toEqual([
      expect.stringContaining("Tercero por fecha"),
      expect.stringContaining("Primero literal"),
      expect.stringContaining("Segundo literal")
    ])
    // Supplied text is rendered as plain text, never interpreted as HTML.
    expect(items[1].querySelector("b")).toBeNull()
    expect(items[1].textContent).toContain("<b>Primero literal</b>")
    expect(items[2].textContent).toContain("Segundo literal\nsegunda línea")
    // Instants stay literal UTC values in server order, with no relative wording.
    expect(items[0].textContent).toContain("2026-03-05T12:00:00.000Z")
    expect(items[1].textContent).toContain("2026-03-03T09:00:00.000Z")
    expect(items[2].textContent).toContain("2026-03-04T09:00:00.000Z")
    expect(app.text()).not.toMatch(/hace \d|ayer|reci[eé]n/i)
    app.http.expectNone(() => true)
  })

  it("marks the customer origin and renders the redacted author without inventing one", async () => {
    const app = await setup()
    app
      .pending()
      .flush(
        detailDto(17, {}, [
          followUpDto(90, null, false, "Nota interna del personal"),
          followUpDto(91, "Cliente autorizado", true, "Réplica del cliente")
        ])
      )
    await app.settle()

    const [redacted, customer] = app.timeline()
    // S7: the backend redacts the staff author as null; the UI says so and stops there.
    expect(redacted.textContent).toMatch(/autor no mostrado/i)
    expect(redacted.textContent).toContain("Del personal")
    expect(redacted.textContent).not.toContain("Cliente autorizado")
    expect(redacted.textContent).not.toContain("8")
    expect(redacted.textContent).not.toContain("19")
    expect(redacted.textContent).not.toContain("No puedo ver mi factura")
    expect(redacted.querySelector("[data-follow-up-author]")?.textContent?.trim()).toBe(
      "Autor no mostrado"
    )
    // A supplied author is shown exactly as it arrived, and the customer origin is marked.
    expect(customer.textContent).toContain("Cliente autorizado")
    expect(customer.textContent).toContain("Del cliente")
    expect(customer.querySelector("[data-follow-up-author]")?.textContent?.trim()).toBe(
      "Cliente autorizado"
    )
    app.http.expectNone(() => true)
  })

  it("distinguishes initial loading, retryable error and verified detail", async () => {
    const app = await setup()
    expect(app.text()).toMatch(/cargando atenci[oó]n/i)
    expect(app.text()).not.toMatch(/reintentar/i)

    // A backend denial is safe, retryable and never leaks the backend message.
    app
      .pending()
      .flush({ mensaje: "Private backend failure" }, { status: 403, statusText: "Forbidden" })
    await app.settle()
    expect(app.text()).toMatch(/no tienes permiso/i)
    expect(app.text()).not.toContain("Private backend failure")
    expect(app.text()).not.toContain("Cliente autorizado")
    expect(app.text()).not.toMatch(/cargando atenci[oó]n/i)
    app.http.expectNone(() => true)

    await app.retry()
    expect(app.text()).toMatch(/cargando atenci[oó]n/i)
    app.pending().flush({ atencion: requestDto(17, { cliente: null }), seguimiento: [] })
    await app.settle()
    expect(app.text()).toMatch(/respuesta.*no es v[aá]lida/i)
    expect(app.text()).not.toContain("Cliente autorizado")
    app.http.expectNone(() => true)

    await app.retry()
    app.pending().flush(detailDto())
    await app.settle()
    expect(app.text()).toContain("Cliente autorizado")
    expect(app.text()).not.toMatch(/reintentar/i)
    app.http.expectNone(() => true)
  })

  it("keeps the verified detail visible while a same-id refresh fails and retries with GET only", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    const app = await setup()
    app.pending().flush(detailDto())
    await app.settle()
    expect(app.text()).toContain("Cliente autorizado")

    await app.navigate("/admin/support")
    now.mockReturnValue(31001)
    await app.navigate("/admin/support/17")
    const refresh = app.pending()
    expect(app.text()).toContain("Cliente autorizado")
    expect(app.text()).toMatch(/actualizando atenci[oó]n/i)

    refresh.flush({ mensaje: "Private denial" }, { status: 403, statusText: "Forbidden" })
    await app.settle()
    expect(app.text()).toContain("Cliente autorizado")
    expect(app.text()).toContain("Revisando el caso")
    expect(app.text()).toMatch(/desactualizados/i)
    expect(app.text()).toMatch(/no tienes permiso/i)
    expect(app.text()).not.toContain("Private denial")
    expect(app.text()).not.toMatch(/actualizando atenci[oó]n/i)

    await app.retry()
    expect(app.text()).toContain("Cliente autorizado")
    app.pending().flush(detailDto(17, {}, [followUpDto(95, "Agente dos", false, "Caso resuelto")]))
    await app.settle()
    expect(app.text()).toContain("Caso resuelto")
    expect(app.text()).not.toMatch(/desactualizados/i)
    app.http.expectNone(() => true)
  })

  it("cancels the previous route read and never paints another id's record", async () => {
    const app = await setup()
    const old = app.pending()
    await app.navigate("/admin/support/18")
    expect(old.cancelled).toBe(true)
    expect(app.text()).not.toContain("Cliente autorizado")
    expect(() => old.flush(detailDto())).toThrow()

    app.pending(18).flush(detailDto(18, { cliente: "Cliente dieciocho" }))
    await app.settle()
    expect(app.text()).toContain("Cliente dieciocho")

    await app.navigate("/admin/support/19")
    expect(app.text()).not.toContain("Cliente dieciocho")
    expect(app.text()).toMatch(/cargando atenci[oó]n/i)
    app.pending(19).flush({ mensaje: "Nope" }, { status: 404, statusText: "Not Found" })
    await app.settle()
    expect(app.text()).toMatch(/no se encontr[oó] la atenci[oó]n/i)
    expect(app.text()).not.toContain("Cliente dieciocho")
    expect(app.text()).not.toContain("Descripción literal de la atención")
    app.http.expectNone(() => true)
  })

  it("links the associated order to the real operations route and keeps a missing one as text", async () => {
    const app = await setup()
    app.pending().flush(detailDto())
    await app.settle()

    const orderLink = app
      .element()
      .querySelector<HTMLAnchorElement>('a[href^="/admin/operations/orders/"]')
    expect(orderLink?.getAttribute("href")).toBe("/admin/operations/orders/41")
    expect(orderLink?.textContent?.trim()).toBe("ORD-41")

    await app.navigate("/admin/support/18")
    app
      .pending(18)
      .flush(detailDto(18, { idOrden: null, codigoOrden: null, cliente: "Cliente dieciocho" }))
    await app.settle()
    expect(app.element().querySelector('a[href^="/admin/operations/orders/"]')).toBeNull()
    expect(app.text()).toContain("No registrada")
    app.http.expectNone(() => true)

    // A supplied code without a usable order id stays plain text: no invented destination.
    await app.navigate("/admin/support/19")
    app
      .pending(19)
      .flush(detailDto(19, { idOrden: null, codigoOrden: "ORD-77", cliente: "Cliente diecinueve" }))
    await app.settle()
    expect(app.element().querySelector('a[href^="/admin/operations/orders/"]')).toBeNull()
    expect(app.text()).toContain("ORD-77")
    app.http.expectNone(() => true)
  })

  it("returns to the effective inbox page using only the paging context it owns", async () => {
    const app = await setup("/admin/support/17?offset=40&limit=20")
    const pending = app.pending()
    // Query-only context never restarts the same-id read or discards the pending one.
    await app.navigate("/admin/support/17?offset=60&limit=20")
    expect(pending.cancelled).toBe(false)
    app.http.expectNone(() => true)
    pending.flush(detailDto())
    await app.settle()

    const back = () => app.links().find(link => link.path === "/admin/support")
    expect(back()?.search).toBe("?offset=60&limit=20")
    expect(back()?.label).toMatch(/volver/i)

    for (const malformed of [
      "?offset=40&limit=0",
      "?offset=41&limit=20",
      "?offset=2147483660&limit=20",
      "?offset=40&limit=200",
      "?offset=-20&limit=20",
      "?offset=20",
      "?offset=20&offset=20&limit=20"
    ]) {
      await app.navigate(`/admin/support/17${malformed}`)
      expect(back()?.search, malformed).toBe("?offset=0&limit=20")
      app.http.expectNone(() => true)
    }
    // A stray filter parameter is never re-serialized: only the paging context survives.
    await app.navigate("/admin/support/17?offset=20&limit=20&estado=RECIBIDA")
    expect(back()?.search).toBe("?offset=20&limit=20")
    expect(app.text()).toContain("Cliente autorizado")
    app.http.expectNone(() => true)
  })

  it("dispatches no read outside a browser session and never fabricates a record", async () => {
    const app = await setup("/admin/support/17", { server: true })
    expect(app.text()).not.toMatch(/cargando atenci[oó]n/i)
    expect(app.text()).not.toContain("Cliente autorizado")
    expect(app.text()).not.toContain("No registrado")
    expect(app.timeline()).toHaveLength(0)
    app.http.expectNone(() => true)
  })
})
