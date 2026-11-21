import { provideHttpClient, withInterceptors } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, of } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthHttpSource } from "@/app/features/auth/infrastructure/source/auth-http.source"
import { AuthPersistentSession } from "@/app/features/auth/infrastructure/session/auth-persistent-session"
import { authInterceptor } from "@/app/features/auth/infrastructure/interceptors/auth.interceptor"
import { provideCustomerSupportReads } from "@/app/features/customer-support/customer-support.providers"
import { PortalSupportDetailPage } from "./portal-support-detail-page"

/** Destination only: the detail return link and route destruction are exercised without the list. */
@Component({ template: "<p>Mi soporte</p>" })
class PortalSupportDestination {}

const api = "http://localhost:8080/api/atenciones"
const portalSupport = "/portal/support"
const customer = () =>
  AuthSession.create("Cliente Portal", "cliente@example.test", "CLIENTE", null, 9, 4, "es", [])

function requestDto(id = 17, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    idAtencion: id,
    idCliente: 88,
    cliente: "Cliente Propio",
    idOrden: 41,
    codigoOrden: "ORD-41",
    idTipo: 4,
    tipo: "Consulta",
    requiereRespuesta: true,
    estado: "EN_REVISION",
    estadoNombre: "En revisión",
    asunto: "No puedo ver mi factura",
    descripcion: "Descripción literal de la atención",
    fechaRegistro: "2026-03-02T04:30:00-05:00",
    fechaCierre: null as string | null,
    ...overrides
  }
}

function followUpDto(
  id: number,
  autor: string | null,
  delCliente: boolean,
  mensaje: string,
  fecha = "2026-03-03T09:00:00Z"
) {
  return { idSeguimiento: id, autor, delCliente, mensaje, fecha }
}

function detailDto(
  id = 17,
  overrides: Record<string, unknown> = {},
  followUps: unknown[] = [followUpDto(91, "Agente de soporte", false, "Revisando el caso")]
) {
  return { atencion: requestDto(id, overrides), seguimiento: followUps }
}

async function setup(options: { url?: string; server?: boolean; interceptor?: boolean } = {}) {
  TestBed.resetTestingModule()
  const session = new BehaviorSubject<AuthSession | null>(customer())
  TestBed.configureTestingModule({
    providers: [
      // The real seam: the auth interceptor the app installs, not only the page's own mapping.
      options.interceptor
        ? provideHttpClient(withInterceptors([authInterceptor]))
        : provideHttpClient(),
      ...(options.interceptor
        ? [
            {
              provide: AuthPersistentSession,
              useValue: { browser: true, origin: "http://localhost:8080" }
            },
            {
              provide: AuthHttpSource,
              useValue: { accessToken: () => of("synthetic-access"), invalidate: () => undefined }
            }
          ]
        : []),
      provideHttpClientTesting(),
      provideCustomerSupportReads(),
      provideRouter([
        { path: "portal/support", component: PortalSupportDestination },
        { path: "portal/support/:id", component: PortalSupportDetailPage }
      ]),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } }
    ]
  })
  const harness = await RouterTestingHarness.create(options.url ?? "/portal/support/17")
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement!
  const text = () => element().textContent ?? ""
  const http = TestBed.inject(HttpTestingController)
  const pending = (id = 17) => {
    const request = http.expectOne(`${api}/${id}`)
    expect(request.request.method).toBe("GET")
    // The backend scopes the detail to the caller: no customer id and no invented query.
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.transferCache).toBe(false)
    return request
  }
  const buttons = () =>
    Array.from(element().querySelectorAll<HTMLButtonElement>("button")).filter(
      button => !button.disabled
    )
  const back = () => {
    const link = Array.from(element().querySelectorAll<HTMLAnchorElement>("a[href]")).find(
      item => new URL(item.href).pathname === portalSupport
    )
    expect(link, "Return link to Soporte").toBeDefined()
    return link!
  }
  const navigate = async (target: string) => {
    await TestBed.inject(Router).navigateByUrl(target)
    await settle()
  }
  const retry = async () => {
    const button = buttons().find(item => /reintentar/i.test(item.textContent ?? ""))
    expect(button, "Visible explicit retry action").toBeDefined()
    button!.click()
    await settle()
  }
  const followUps = () => Array.from(element().querySelectorAll<HTMLElement>("[data-follow-up-id]"))
  const author = (id: number) =>
    element().querySelector<HTMLElement>(`[data-follow-up-id="${id}"] [data-follow-up-author]`)
  return {
    harness,
    element,
    text,
    http,
    pending,
    buttons,
    back,
    navigate,
    retry,
    followUps,
    author,
    session,
    settle
  }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    vi.restoreAllMocks()
  }
})

// WP10 T5/S7: one of the customer's own attentions, read-only, scoped by the backend.
describe("PortalSupportDetailPage", () => {
  it.each(["0", "-3", "1.5", "abc", "2147483648", "17a"])(
    "renders no disponible for the malformed id %s without any read",
    async id => {
      const s = await setup({ url: `/portal/support/${id}` })
      expect(s.element().querySelector("[data-detail-invalid]")).not.toBeNull()
      expect(s.text()).toContain("Atención no disponible")
      // A broken link is not a permission hint and never offers a retry.
      expect(s.text()).not.toMatch(/permiso/i)
      expect(s.buttons()).toHaveLength(0)
      expect(s.element().querySelector("[data-detail-unavailable]")).toBeNull()
      s.http.expectNone(() => true)
    }
  )

  it("renders the supplied attention literally with no write or staff affordance", async () => {
    const s = await setup()
    expect(s.text()).toMatch(/Cargando atención/)
    expect(s.element().querySelector('[role="status"]')?.textContent).toMatch(/Cargando atención/)
    s.pending().flush(detailDto())
    await s.settle()

    const record = s.element().querySelector("[data-detail-record]")!
    expect(record).not.toBeNull()
    expect(record.textContent).toContain("No puedo ver mi factura")
    expect(record.textContent).toContain("Descripción literal de la atención")
    expect(record.textContent).toContain("Consulta")
    // The supplied display text of the closed state, printed as received.
    const badge = record.querySelector("[data-support-state]")!
    expect(badge.textContent?.trim()).toBe("En revisión")
    // Instants keep the supplied UTC value; the null closure uses the project's absence copy.
    expect(record.textContent).toContain("2026-03-02T09:30:00.000Z")
    expect(record.textContent).toContain("No registrado")
    // No invented state, transition or derived label.
    expect(record.textContent).not.toContain("EN_REVISION")

    // Read-only: the only link is the way back and no administrative destination exists.
    expect(s.buttons()).toHaveLength(0)
    expect(
      Array.from(s.element().querySelectorAll<HTMLAnchorElement>("a[href]")).map(
        link => new URL(link.href).pathname
      )
    ).toEqual([portalSupport])
    expect(s.element().querySelectorAll('a[href^="/admin"]')).toHaveLength(0)
    expect(s.text()).not.toMatch(/Responder|Cambiar estado|Cerrar atención|Crear atención/)
    s.http.expectNone(candidate => candidate.method !== "GET")
  })

  it("renders a null follow-up author as an explicit redaction without a substitute identity", async () => {
    const s = await setup()
    s.pending().flush(
      detailDto(17, {}, [
        followUpDto(90, null, false, "Mensaje sin autor visible"),
        followUpDto(91, "Agente de soporte", false, "Mensaje firmado"),
        followUpDto(92, null, true, "Mensaje del cliente")
      ])
    )
    await s.settle()

    // Server order is preserved and every follow-up is rendered once.
    expect(s.followUps().map(item => item.dataset["followUpId"])).toEqual(["90", "91", "92"])

    // A null author states the absence; it never borrows a name, an id, a role or another field.
    const redacted = s.author(90)!
    expect(redacted).not.toBeNull()
    expect(redacted.getAttribute("data-follow-up-author-redacted")).toBe("true")
    expect(redacted.textContent?.trim()).toMatch(/no mostrado/i)
    expect(redacted.textContent).not.toContain("90")
    expect(redacted.textContent).not.toMatch(/personal|agente|cliente|usuario/i)

    // A supplied author is printed as it arrived.
    const supplied = s.author(91)!
    expect(supplied.getAttribute("data-follow-up-author-redacted")).toBeNull()
    expect(supplied.textContent?.trim()).toBe("Agente de soporte")

    // The second redacted entry shares the same explicit treatment, never the customer identity.
    const customerSide = s.author(92)!
    expect(customerSide.getAttribute("data-follow-up-author-redacted")).toBe("true")
    expect(customerSide.textContent).not.toContain("92")
    expect(s.text()).not.toContain("Cliente Propio")
    s.http.expectNone(candidate => candidate.method !== "GET")
  })

  it("treats the caller-scoped 404 as not available, never as a transient failure", async () => {
    const s = await setup()
    s.pending().flush({ mensaje: "RAW INTERNAL DETAIL" }, { status: 404, statusText: "Not Found" })
    await s.settle()
    const state = s.element().querySelector("[data-detail-unavailable]")!
    expect(state).not.toBeNull()
    expect(state.textContent).toContain("Atención no disponible")
    expect(state.textContent).toMatch(/no está disponible en tu cuenta/i)
    // Not a permission hint, not a retryable failure, and no leaked backend text.
    expect(state.textContent).not.toMatch(/permiso/i)
    expect(s.text()).not.toContain("RAW INTERNAL DETAIL")
    expect(s.element().querySelector("[data-detail-error]")).toBeNull()
    expect(s.element().querySelector("[data-detail-record]")).toBeNull()
    expect(s.buttons()).toHaveLength(0)
    s.http.expectNone(() => true)
  })

  it("keeps that distinct state when the 404 travels through the real auth interceptor", async () => {
    const s = await setup({ interceptor: true })
    s.pending().flush({ mensaje: "RAW INTERNAL DETAIL" }, { status: 404, statusText: "Not Found" })
    await s.settle()
    const state = s.element().querySelector("[data-detail-unavailable]")!
    expect(state).not.toBeNull()
    expect(state.textContent).toContain("Atención no disponible")
    // The retryable state must not appear: repeating the same GET cannot change the answer.
    expect(s.element().querySelector("[data-detail-error]")).toBeNull()
    expect(s.element().querySelector("[data-detail-record]")).toBeNull()
    expect(s.buttons()).toHaveLength(0)
    s.http.expectNone(() => true)
  })

  it("drops an already verified record when the server answers 404 on refresh", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    s.pending().flush(detailDto())
    await s.settle()
    expect(s.element().querySelector("[data-detail-record]")).not.toBeNull()

    await s.navigate("/portal/support/18")
    s.pending(18).flush(detailDto(18, { asunto: "Otro asunto" }))
    await s.settle()
    clock.mockReturnValue(31000 + 1000)
    await s.navigate("/portal/support/17")
    s.pending(17).flush({}, { status: 404, statusText: "Not Found" })
    await s.settle()
    expect(s.element().querySelector("[data-detail-unavailable]")).not.toBeNull()
    expect(s.element().querySelector("[data-detail-record]")).toBeNull()
    expect(s.text()).not.toContain("No puedo ver mi factura")
    s.http.expectNone(() => true)
  })

  it("keeps verified data while refreshing and on a transient error, with a GET-only retry", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    s.pending().flush(detailDto())
    await s.settle()
    await s.navigate("/portal/support/18")
    s.pending(18).flush(detailDto(18, { asunto: "Otro asunto" }))
    await s.settle()

    clock.mockReturnValue(31000 + 1000)
    await s.navigate("/portal/support/17")
    const refresh = s.pending(17)
    expect(s.element().querySelector("[data-detail-record]")?.textContent).toContain(
      "No puedo ver mi factura"
    )
    expect(s.text()).toMatch(/Actualizando atención/)

    refresh.error(new ProgressEvent("error"))
    await s.settle()
    const error = s.element().querySelector("[data-detail-error]")!
    expect(error).not.toBeNull()
    expect(error.textContent).toMatch(/desactualizados/i)
    expect(s.element().querySelector("[data-detail-record]")?.textContent).toContain(
      "No puedo ver mi factura"
    )

    await s.retry()
    const retried = s.pending(17)
    // Retry re-issues exactly the GET and keeps the verified record while it runs.
    expect(retried.request.method).toBe("GET")
    expect(s.element().querySelector("[data-detail-record]")?.textContent).toContain(
      "No puedo ver mi factura"
    )
    retried.flush(detailDto())
    await s.settle()
    expect(s.element().querySelector("[data-detail-error]")).toBeNull()
    s.http.expectNone(candidate => candidate.method !== "GET")
  })

  it("keeps the list's effective paging in the return link when the URL carries it", async () => {
    const s = await setup({ url: "/portal/support/17?page=2&size=10" })
    s.pending().flush(detailDto())
    await s.settle()
    expect(new URL(s.back().href).search).toBe("?page=2&size=10")
    expect(s.back().textContent).toMatch(/Volver a soporte/)

    // A malformed pair falls back to the documented first page instead of inventing one.
    const malformed = await setup({ url: "/portal/support/17?page=x&size=10" })
    malformed.pending().flush(detailDto())
    await malformed.settle()
    expect(new URL(malformed.back().href).search).toBe("?page=0&size=20")
    malformed.http.expectNone(() => true)
  })

  it("cancels its read on session replacement and reloads under the new session", async () => {
    const s = await setup()
    const first = s.pending()
    s.session.next(
      AuthSession.create("Otra Cliente", "otra@example.test", "CLIENTE", null, 10, 4, "es", [])
    )
    // The previous session's read never survives the replacement.
    expect(first.cancelled).toBe(true)
    await s.settle()
    const second = s.pending()
    expect(second.request.url).toBe(`${api}/17`)
    // A request that is not the new caller's answers 404, which stays "no disponible".
    second.flush({}, { status: 404, statusText: "Not Found" })
    await s.settle()
    expect(s.element().querySelector("[data-detail-unavailable]")).not.toBeNull()
    expect(s.text()).not.toContain("No puedo ver mi factura")
    s.http.expectNone(() => true)
  })

  it("cancels a live read when the route is destroyed", async () => {
    const s = await setup()
    const request = s.pending()
    await s.navigate("/portal/support")
    expect(request.cancelled).toBe(true)
    expect(s.text()).toContain("Mi soporte")
    s.http.expectNone(() => true)
  })

  it("dispatches no read on the server platform", async () => {
    await setup({ server: true })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
