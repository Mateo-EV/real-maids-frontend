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
import { CUSTOMER_REPOSITORY } from "@/app/features/customers/domain/repositories/customer.repository"
import { CustomerRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/customer.repository-impl"
import { PortalProfilePage } from "./portal-profile-page"

const origin = "http://localhost:8080"
const url = `${origin}/api/clientes/me`
const stamp = "2026-03-02T04:30:00-05:00"

/** Destination only: route destruction is exercised without the requests list. */
@Component({ selector: "app-portal-profile-destination", template: "<p>Mis solicitudes</p>" })
class RequestsDestination {}

const customer = (id = 9, expires = 4102444800000) =>
  AuthSession.create("Ana Pérez", "ana@example.test", "CLIENTE", expires, id, 4, "es", [])

/** `ClienteResponse` wire DTO: the same fifteen keys the staff detail returns. */
const ownDto = (overrides: Record<string, unknown> = {}) => ({
  idCliente: 4242,
  nombre: "Ana Pérez",
  tipo: "residencial",
  correo: "ana@example.test",
  telefono: "+56 9 1234 5678",
  activo: true,
  idUsuario: 24,
  usuarioActivo: true,
  fechaCreacion: stamp,
  fechaActualizacion: null,
  idProspecto: null,
  identificacionFiscal: null,
  sistemaOrigen: null,
  idExterno: null,
  usuarioRegistro: null,
  ...overrides
})

/** Whitespace-collapsed text: the assertion is about copy, not about template indentation. */
const flat = (node: Node | null | undefined) =>
  (node?.textContent ?? "").replace(/\s+/g, " ").trim()

async function setup(options: { server?: boolean; interceptor?: boolean } = {}) {
  TestBed.resetTestingModule()
  const sessions = new BehaviorSubject<AuthSession | null>(customer())
  TestBed.configureTestingModule({
    providers: [
      // The real seam: the auth interceptor the app installs, not only the page's own mapping.
      options.interceptor
        ? provideHttpClient(withInterceptors([authInterceptor]))
        : provideHttpClient(),
      ...(options.interceptor
        ? [
            { provide: AuthPersistentSession, useValue: { browser: true, origin } },
            {
              provide: AuthHttpSource,
              useValue: { accessToken: () => of("synthetic-access"), invalidate: () => undefined }
            }
          ]
        : []),
      provideHttpClientTesting(),
      provideRouter([
        { path: "portal/profile", component: PortalProfilePage },
        { path: "portal/requests", component: RequestsDestination }
      ]),
      { provide: API_URL, useValue: origin },
      // The page consumes the real root store and the real transport, never a stub pair.
      { provide: CUSTOMER_REPOSITORY, useExisting: CustomerRepositoryImpl },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      { provide: AuthStore, useValue: { session: () => sessions.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => sessions.asObservable() } }
    ]
  })
  const http = TestBed.inject(HttpTestingController)
  const router = TestBed.inject(Router)
  const harness = await RouterTestingHarness.create("/portal/profile")
  /** A post-await continuation is not tracked by whenStable; drain both queues. */
  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const root = () => harness.routeNativeElement!
  const text = () => flat(root())
  const button = (label: string) =>
    [...root().querySelectorAll<HTMLButtonElement>("button")].find(item => flat(item) === label)
  const click = async (label: string) => {
    const target = button(label)
    expect(target, label).toBeDefined()
    target!.click()
    await settle()
  }
  const fill = async (selector: string, value: string) => {
    const control = root().querySelector<HTMLInputElement>(selector)
    expect(control, selector).not.toBeNull()
    control!.value = value
    control!.dispatchEvent(new Event("input", { bubbles: true }))
    control!.dispatchEvent(new Event("blur"))
    await settle()
  }
  const submit = async () => {
    const form = root().querySelector("form")
    expect(form, "Signal Form exposed through the DOM").not.toBeNull()
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  /** The own-profile read: no id, no query and no transfer cache. */
  const pendingGet = () => {
    const request = http.expectOne(candidate => candidate.url === url && candidate.method === "GET")
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.transferCache).toBe(false)
    return request
  }
  const pendingPut = () => {
    const requests = http.match(candidate => candidate.method === "PUT")
    expect(requests).toHaveLength(1)
    expect(requests[0].request.url).toBe(url)
    expect(requests[0].request.transferCache).toBe(false)
    return requests[0]
  }
  const expectNoWrite = () => http.expectNone(candidate => candidate.method !== "GET")
  return {
    harness,
    http,
    router,
    session: sessions,
    settle,
    root,
    text,
    flat,
    button,
    click,
    fill,
    submit,
    pendingGet,
    pendingPut,
    expectNoWrite
  }
}

type Harness = Awaited<ReturnType<typeof setup>>

async function openVerifiedProfile(s: Harness) {
  s.pendingGet().flush(ownDto())
  await s.settle()
  return s.root()
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    vi.restoreAllMocks()
  }
})

describe("PortalProfilePage", () => {
  it("reads the caller's own profile and prints only the supplied fields", async () => {
    const s = await setup()
    expect(s.text()).toMatch(/Cargando tu perfil/)
    expect(s.flat(s.root().querySelector('[role="status"]'))).toMatch(/Cargando tu perfil/)

    const element = await openVerifiedProfile(s)
    const record = element.querySelector("[data-profile-record]")!
    expect(record).not.toBeNull()
    expect(s.flat(record)).toContain("Ana Pérez")
    expect(s.flat(record)).toContain("+56 9 1234 5678")
    expect(s.flat(record)).toContain("residencial")
    s.expectNoWrite()
  })

  it("shows the email as read-only and explains that only the office can change it", async () => {
    const s = await setup()
    const element = await openVerifiedProfile(s)
    const email = element.querySelector<HTMLInputElement>("#portal-profile-email")!
    expect(email).not.toBeNull()
    expect(email.value).toBe("ana@example.test")
    expect(email.readOnly).toBe(true)
    expect(email.hasAttribute("readonly")).toBe(true)
    expect(s.flat(element.querySelector("#portal-profile-email-help"))).toBe(
      "Solo la oficina puede cambiar este correo: es la dirección con la que inicias sesión."
    )
    s.expectNoWrite()
  })

  it("never renders ids, account state or timestamps the screen does not need", async () => {
    const s = await setup()
    const element = await openVerifiedProfile(s)
    const text = s.flat(element)
    // The payload carries all of them; the profile screen shows none of them.
    expect(text).not.toContain("4242")
    expect(text).not.toContain("2026-03-02")
    expect(text).not.toMatch(/activo|inactivo|\bcuenta\b/i)
    expect(text).not.toMatch(/fecha|registro|creación/i)
    s.expectNoWrite()
  })

  it("treats the documented 404 as a stable unlinked profile state, never as a failure", async () => {
    const s = await setup()
    s.pendingGet().flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    await s.settle()
    const missing = s.root().querySelector("[data-profile-missing]")!
    expect(missing).not.toBeNull()
    expect(s.flat(missing)).toContain("Sin perfil vinculado")
    expect(s.flat(missing)).toMatch(/todavía no está vinculada/i)
    // Not a retryable failure, no permission hint, no workaround and no server copy.
    expect(s.root().querySelector("[data-profile-error]")).toBeNull()
    expect(s.root().querySelector("[data-profile-record]")).toBeNull()
    expect(s.text()).not.toContain("RAW INTERNAL")
    expect(s.text()).not.toMatch(/permiso/i)
    expect(s.text()).not.toMatch(/escríbenos|solicítalo|contacta al administrador/i)
    expect(s.root().querySelectorAll("button")).toHaveLength(0)
    s.http.expectNone(() => true)
  })

  it("keeps that stable state when the 404 travels through the real auth interceptor", async () => {
    const s = await setup({ interceptor: true })
    s.pendingGet().flush({ mensaje: "RAW INTERNAL" }, { status: 404, statusText: "Not Found" })
    await s.settle()
    const missing = s.root().querySelector("[data-profile-missing]")!
    expect(missing).not.toBeNull()
    expect(s.flat(missing)).toContain("Sin perfil vinculado")
    // The retryable state must not appear: the account has no linked profile, it is not a failure.
    expect(s.root().querySelector("[data-profile-error]")).toBeNull()
    expect(s.root().querySelector("[data-profile-record]")).toBeNull()
    expect(s.root().querySelectorAll("button")).toHaveLength(0)
    s.http.expectNone(() => true)
  })

  it("reports a transient first read with an explicit GET-only retry", async () => {
    const s = await setup()
    s.pendingGet().error(new ProgressEvent("error"))
    await s.settle()
    const error = s.root().querySelector("[data-profile-error]")!
    expect(error).not.toBeNull()
    expect(s.flat(error)).toMatch(/No se pudo cargar tu perfil/i)
    expect(s.root().querySelector("[data-profile-record]")).toBeNull()
    expect(s.root().querySelector("[data-profile-missing]")).toBeNull()

    await s.click("Reintentar")
    // The retry re-issues exactly the same GET and nothing else.
    s.pendingGet().flush(ownDto())
    await s.settle()
    expect(s.root().querySelector("[data-profile-error]")).toBeNull()
    expect(s.flat(s.root().querySelector("[data-profile-record]"))).toContain("Ana Pérez")
    s.expectNoWrite()
  })

  it("keeps the verified record when a revalidation fails, and retries with one GET", async () => {
    const s = await setup()
    await openVerifiedProfile(s)
    await s.click("Editar")
    await s.submit()
    s.pendingPut().flush(ownDto())
    await s.settle()
    // The confirmed write revalidates the read exactly once; that refresh fails.
    s.pendingGet().error(new ProgressEvent("error"))
    await s.settle()

    const error = s.root().querySelector("[data-profile-error]")!
    expect(error).not.toBeNull()
    expect(s.flat(error)).toMatch(/desactualizados/i)
    expect(s.flat(s.root().querySelector("[data-profile-record]"))).toContain("Ana Pérez")

    await s.click("Reintentar")
    s.pendingGet().flush(ownDto())
    await s.settle()
    expect(s.root().querySelector("[data-profile-error]")).toBeNull()
    expect(s.flat(s.root().querySelector("[data-profile-record]"))).toContain("Ana Pérez")
    s.expectNoWrite()
  })

  it("edits nombre and telefono only and sends exactly those two fields", async () => {
    const s = await setup()
    const element = await openVerifiedProfile(s)
    await s.click("Editar")
    const form = element.querySelector("[data-profile-form]")!
    expect(form).not.toBeNull()
    // The draft starts from the verified record.
    expect(form.querySelector<HTMLInputElement>("#portal-profile-name")!.value).toBe("Ana Pérez")
    expect(form.querySelector<HTMLInputElement>("#portal-profile-phone")!.value).toBe(
      "+56 9 1234 5678"
    )
    // The form never offers the read-only or staff-only fields the endpoint does not accept.
    expect(form.querySelector("#portal-profile-email")).toBeNull()
    expect(s.flat(form)).not.toMatch(/correo/i)
    expect(form.querySelectorAll("select")).toHaveLength(0)

    await s.fill("#portal-profile-name", "  Ana Pérez Ruiz  ")
    await s.fill("#portal-profile-phone", "   ")
    await s.submit()
    const request = s.pendingPut()
    // Trimmed name, blank phone as null, and exactly the two documented keys.
    expect(request.request.body).toEqual({ nombre: "Ana Pérez Ruiz", telefono: null })
    expect(Object.keys(request.request.body)).toEqual(["nombre", "telefono"])

    request.flush(ownDto({ nombre: "Ana Pérez Ruiz", telefono: null }))
    await s.settle()
    // Exactly one post-write read, never a second write or another reload.
    s.pendingGet().flush(ownDto({ nombre: "Ana Pérez Ruiz", telefono: null }))
    await s.settle()
    expect(s.flat(s.root().querySelector("[data-profile-record]"))).toContain("Ana Pérez Ruiz")
    expect(s.flat(s.root().querySelector("[data-profile-record]"))).toContain("No registrado")
    s.http.expectNone(candidate => candidate.method !== "GET")
  })

  it("validates the name and the documented phone rule before any dispatch", async () => {
    const s = await setup()
    await openVerifiedProfile(s)
    await s.click("Editar")

    await s.fill("#portal-profile-name", "   ")
    await s.submit()
    expect(s.flat(s.root().querySelector("#portal-profile-name-errors"))).toMatch(
      /Ingresa tu nombre/
    )
    s.expectNoWrite()

    await s.fill("#portal-profile-name", "Ana Pérez")
    await s.fill("#portal-profile-phone", "12")
    await s.submit()
    expect(s.flat(s.root().querySelector("#portal-profile-phone-errors"))).toMatch(
      /teléfono válido de 7 a 30 caracteres/
    )
    s.expectNoWrite()

    await s.fill("#portal-profile-phone", "+56 9 1234 5678 90 12 34 56 789")
    await s.submit()
    expect(s.flat(s.root().querySelector("#portal-profile-phone-errors"))).toMatch(
      /máximo 30 caracteres/
    )
    s.expectNoWrite()
  })

  it("blocks a duplicate submit and refuses to dismiss the form while pending", async () => {
    const s = await setup()
    await openVerifiedProfile(s)
    await s.click("Editar")
    await s.fill("#portal-profile-phone", "+56 9 8765 4321")
    await s.submit()
    const request = s.pendingPut()
    // One write in flight: the submit and the dismissal are refused, not dispatched.
    await s.submit()
    await s.click("Cancelar")
    expect(s.http.match(candidate => candidate.method === "PUT")).toHaveLength(0)
    expect(s.root().querySelector("[data-profile-form]")).not.toBeNull()
    expect(s.button("Cancelar")?.disabled).toBe(true)
    expect(s.button("Guardando…")?.disabled).toBe(true)

    request.flush(ownDto({ telefono: "+56 9 8765 4321" }))
    await s.settle()
    s.pendingGet().flush(ownDto({ telefono: "+56 9 8765 4321" }))
    await s.settle()
    expect(s.root().querySelector("[data-profile-form]")).toBeNull()
    s.expectNoWrite()
  })

  it("binds a documented 400 to its field, keeps the draft and never prints server copy", async () => {
    const s = await setup()
    await openVerifiedProfile(s)
    await s.click("Editar")
    await s.fill("#portal-profile-name", "Ana P. Ruiz")
    await s.fill("#portal-profile-phone", "+56 9 1111 2222")
    await s.submit()
    s.pendingPut().flush(
      { codigo: 400, mensaje: "PRIVATE SERVER TEXT", errores: { telefono: "marker" } },
      { status: 400, statusText: "Bad Request" }
    )
    await s.settle()

    const errors = s.root().querySelector("#portal-profile-phone-errors")!
    expect(s.flat(errors)).toMatch(/El servicio rechazó el teléfono/)
    expect(errors.querySelector('[role="alert"]')).not.toBeNull()
    const phone = s.root().querySelector<HTMLInputElement>("#portal-profile-phone")!
    expect(phone.getAttribute("aria-invalid")).toBe("true")
    // The draft survives the failure and the form stays open for an explicit retry.
    expect(phone.value).toBe("+56 9 1111 2222")
    expect(s.root().querySelector<HTMLInputElement>("#portal-profile-name")!.value).toBe(
      "Ana P. Ruiz"
    )
    expect(s.root().querySelector("[data-profile-form]")).not.toBeNull()
    expect(s.root().querySelector("[data-profile-saved]")).toBeNull()
    expect(s.text()).not.toContain("PRIVATE SERVER TEXT")
    // Nothing is replayed on its own.
    s.expectNoWrite()
  })

  it("keeps an unattributed validation answer in the general inline error, without server copy", async () => {
    const s = await setup()
    await openVerifiedProfile(s)
    await s.click("Editar")
    await s.fill("#portal-profile-name", "Ana P. Ruiz")
    await s.submit()
    s.pendingPut().flush(
      { mensaje: "PRIVATE SERVER TEXT" },
      { status: 400, statusText: "Bad Request" }
    )
    await s.settle()
    const error = s.root().querySelector("[data-profile-write-error]")!
    expect(error).not.toBeNull()
    expect(s.flat(error)).toMatch(/Revisa los datos de tu perfil/)
    expect(s.text()).not.toContain("PRIVATE SERVER TEXT")
    // The draft is untouched and no field is blamed without a documented marker.
    expect(s.root().querySelector<HTMLInputElement>("#portal-profile-name")!.value).toBe(
      "Ana P. Ruiz"
    )
    expect(s.flat(s.root().querySelector("#portal-profile-name-errors"))).not.toMatch(
      /El servicio rechazó/
    )
    s.expectNoWrite()
  })

  it("reports feedback only after a confirmed success and then refreshes the read once", async () => {
    const s = await setup()
    await openVerifiedProfile(s)
    await s.click("Editar")
    await s.fill("#portal-profile-name", "Ana Pérez Ruiz")
    await s.submit()
    s.pendingPut().flush({}, { status: 500, statusText: "Server Error" })
    await s.settle()
    expect(s.root().querySelector("[data-profile-saved]")).toBeNull()
    expect(s.root().querySelector("[data-profile-write-error]")).not.toBeNull()
    expect(s.root().querySelector("[data-profile-form]")).not.toBeNull()

    await s.submit()
    s.pendingPut().flush(ownDto({ nombre: "Ana Pérez Ruiz" }))
    await s.settle()
    const saved = s.root().querySelector("[data-profile-saved]")!
    expect(saved).not.toBeNull()
    expect(s.flat(saved)).toMatch(/guardaron|actualizó/i)
    // The confirmed write is the only trigger of a revalidation: exactly one GET afterwards.
    s.pendingGet().flush(ownDto({ nombre: "Ana Pérez Ruiz" }))
    await s.settle()
    expect(s.flat(s.root().querySelector("[data-profile-record]"))).toContain("Ana Pérez Ruiz")
    s.expectNoWrite()
  })

  it("reports an unauthorized write as such without blaming a field", async () => {
    const s = await setup()
    await openVerifiedProfile(s)
    await s.click("Editar")
    await s.submit()
    s.pendingPut().flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
    const error = s.root().querySelector("[data-profile-write-error]")!
    expect(error).not.toBeNull()
    expect(s.flat(error)).toMatch(/permiso/i)
    expect(s.root().querySelector("[data-profile-saved]")).toBeNull()
    expect(s.root().querySelector("[data-profile-form]")).not.toBeNull()
    s.expectNoWrite()
  })

  it("cancels its read on session replacement and reloads under the new identity", async () => {
    const s = await setup()
    const first = s.pendingGet()
    s.session.next(customer(10))
    expect(first.cancelled).toBe(true)
    await s.settle()
    // The replacement identity reads its own profile again: nothing from the previous one remains.
    s.pendingGet().flush(ownDto({ nombre: "Otra Persona", correo: "otra@example.test" }))
    await s.settle()
    const record = s.root().querySelector("[data-profile-record]")!
    expect(s.flat(record)).toContain("Otra Persona")
    expect(s.flat(record)).not.toContain("Ana Pérez")
    s.expectNoWrite()
  })

  it("cancels a live read when the route is destroyed", async () => {
    const s = await setup()
    const request = s.pendingGet()
    await TestBed.inject(Router).navigateByUrl("/portal/requests")
    await s.settle()
    expect(request.cancelled).toBe(true)
    expect(s.text()).toContain("Mis solicitudes")
    s.http.expectNone(() => true)
  })

  it("dispatches no read on the server platform", async () => {
    await setup({ server: true })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
