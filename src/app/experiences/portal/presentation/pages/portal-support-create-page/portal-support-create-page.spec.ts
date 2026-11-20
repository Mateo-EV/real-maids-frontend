import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, EMPTY, of } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideCustomerSupportReads } from "@/app/features/customer-support/customer-support.providers"
import { SupportDetail } from "@/app/features/customer-support/domain/models/support-views"
import { SupportRequestsStore } from "@/app/features/customer-support/presentation/state/support-requests.store"
import { provideOperationsRequestReads } from "@/app/features/operations/operations.providers"
import { ServiceOrdersStore } from "@/app/features/operations/presentation/state/service-orders.store"
import { Result } from "@/app/shared/utils/result"
import { portalPendingLeaveGuard } from "../../navigation/portal-support-create-leave.guard"
import { PortalSupportCreatePage } from "./portal-support-create-page"

const origin = "http://localhost:8080"
const requestsUrl = `${origin}/api/atenciones`
const typesUrl = `${origin}/api/catalogos/tipos-atencion`
const ordersUrl = `${origin}/api/ordenes`
const createUrl = "/portal/support/new"
const stamp = "2026-03-02T04:30:00Z"

@Component({ selector: "app-portal-support-list-stub", template: "<p>Lista de soporte</p>" })
class ListStub {}

@Component({ selector: "app-portal-support-detail-stub", template: "<p>Detalle de atención</p>" })
class DetailStub {}

const customer = (name = "Cliente Portal", expires = 4102444800000) =>
  AuthSession.create(name, "cliente@example.test", "CLIENTE", expires, 9, 4, "es", [])

const types = [
  { idTipo: 4, nombre: "Consulta", requiereRespuesta: true },
  { idTipo: 7, nombre: "Queja", requiereRespuesta: true }
]

/** `GET /api/ordenes` wire DTO; the adapter rejects partial or misaligned pages. */
const orderDto = (id = 17, overrides: Record<string, unknown> = {}) => ({
  idOrden: id,
  codigo: `OS-2026-0000${id}`,
  estado: "PROGRAMADA",
  estadoNombre: "Programada",
  idSolicitud: 42,
  idCliente: 88,
  cliente: "Cliente Propio",
  idPropiedad: 31,
  propiedad: `Propiedad ${id}`,
  idTipoServicio: 4,
  tipoServicio: "Limpieza profunda",
  duracionEstimadaMinutos: 90,
  montoEstimado: 120.5,
  observacion: null,
  programacion: null,
  asignados: [],
  fechaCreacion: stamp,
  fechaActualizacion: null,
  ...overrides
})

const ordersPage = (
  contenido: unknown[] = [orderDto()],
  pagina = 0,
  tamanio = 20,
  total?: number
) => {
  const totalElementos = total ?? contenido.length
  return {
    contenido,
    pagina,
    tamanio,
    totalElementos,
    totalPaginas: Math.ceil(totalElementos / tamanio)
  }
}

/** `AtencionResponse` wire DTO for the created answer. */
const attentionDto = (id = 23, overrides: Record<string, unknown> = {}) => ({
  idAtencion: id,
  idCliente: 88,
  cliente: "Cliente Propio",
  idOrden: null as number | null,
  codigoOrden: null as string | null,
  idTipo: 4,
  tipo: "Consulta",
  requiereRespuesta: true,
  estado: "RECIBIDA",
  estadoNombre: "Recibida",
  asunto: "Asunto registrado",
  descripcion: "Descripción registrada",
  fechaRegistro: stamp,
  fechaCierre: null,
  ...overrides
})

const createdDto = (id = 23, overrides: Record<string, unknown> = {}) => ({
  atencion: attentionDto(id, overrides),
  seguimiento: []
})

async function setup(options: { server?: boolean } = {}) {
  TestBed.resetTestingModule()
  const sessions = new BehaviorSubject<AuthSession | null>(customer())
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideCustomerSupportReads(),
      provideOperationsRequestReads(),
      provideRouter([
        { path: "portal/support", component: ListStub },
        {
          path: "portal/support/new",
          component: PortalSupportCreatePage,
          canDeactivate: [portalPendingLeaveGuard]
        },
        { path: "portal/support/:id", component: DetailStub }
      ]),
      { provide: API_URL, useValue: origin },
      { provide: AuthStore, useValue: { session: () => sessions.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => sessions.asObservable() } },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" }
    ]
  })
  const http = TestBed.inject(HttpTestingController)
  const router = TestBed.inject(Router)
  const harness = await RouterTestingHarness.create(createUrl)
  /** A post-await write continuation is not tracked by whenStable; drain both queues. */
  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  const root = () => harness.routeNativeElement!
  const fill = async (
    selector: string,
    value: string,
    kind: "input" | "change" = "input",
    within: ParentNode = root()
  ) => {
    const control = within.querySelector<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >(selector)
    expect(control, selector).not.toBeNull()
    control!.value = value
    control!.dispatchEvent(new Event(kind, { bubbles: true }))
    if (kind === "input") control!.dispatchEvent(new Event("blur"))
    await settle()
  }
  const button = (label: string, within: ParentNode = root()) =>
    [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
  const submit = async (within: ParentNode = root()) => {
    const form = within.querySelector("form")
    expect(form, "Signal Form exposed through DOM").not.toBeNull()
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  const posts = () => http.match(request => request.method === "POST")
  /** One open POST, removed from the pending list exactly once. */
  const openPost = () => http.expectOne(request => request.method === "POST")
  const expectNoPost = () => http.expectNone(request => request.method === "POST")
  const sessions$ = {
    set: (next: AuthSession | null) => sessions.next(next),
    current: () => sessions.value
  }
  return {
    harness,
    http,
    router,
    session: sessions$,
    settle,
    root,
    fill,
    button,
    submit,
    posts,
    openPost,
    expectNoPost
  }
}

/** Entry reads: the supplied type catalog and the caller-scoped own-orders page. */
async function enter(s: Awaited<ReturnType<typeof setup>>) {
  s.http.expectOne(request => request.url === typesUrl).flush(types)
  const orders = s.http.expectOne(request => request.url === ordersUrl)
  expect(orders.request.method).toBe("GET")
  // Caller scope: the backend resolves the customer from the session, so no id travels.
  expect(orders.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
  expect([orders.request.params.get("pagina"), orders.request.params.get("tamanio")]).toEqual([
    "0",
    "20"
  ])
  expect(orders.request.transferCache).toBe(false)
  orders.flush(ordersPage())
  await s.settle()
  return s.root()
}

/** The own-service picker panel: paging and reload live inside it, never in the page. */
async function chooseOrder(
  s: Awaited<ReturnType<typeof setup>>,
  element: HTMLElement,
  value: string
) {
  element.querySelector<HTMLButtonElement>("button#portal-support-create-orderId")!.click()
  await s.settle()
  const panel = document
    .getElementById("portal-support-create-orderId-options")
    ?.closest("hlm-combobox-content") as HTMLElement | null
  expect(panel, "Own-service picker panel").not.toBeNull()
  const option = [...panel!.querySelectorAll<HTMLElement>('[role="option"]')].find(
    item => item.getAttribute("data-value") === value
  )
  expect(option, `Option ${value}`).toBeDefined()
  option!.scrollIntoView = vi.fn()
  option!.click()
  await s.settle()
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    vi.restoreAllMocks()
  }
})

describe("Portal own-attention creation", () => {
  it("reads its choices from the supplied catalog and the customer's own services", async () => {
    const s = await setup()
    const element = await enter(s)
    const select = element.querySelector<HTMLSelectElement>("#portal-support-create-typeId")!
    expect([...select.options].map(option => [option.value, option.textContent?.trim()])).toEqual([
      ["", "Selecciona tipo de atención"],
      ["4", "Consulta"],
      ["7", "Queja"]
    ])
    // The type is required, the own service is explicitly optional, and both carry help/errors.
    expect(element.querySelector("hlm-native-select")!.getAttribute("aria-describedby")).toContain(
      "portal-support-create-typeId-errors"
    )
    for (const field of ["subject", "description"]) {
      const control = element.querySelector(`#portal-support-create-${field}`)!
      // Help is associated through the field's a11y service; the required flag is explicit.
      expect(control.getAttribute("aria-describedby") ?? "", field).toContain(
        `portal-support-create-${field}-help`
      )
      expect(control.getAttribute("aria-required"), field).toBe("true")
    }
    expect(element.textContent).toContain("Servicio relacionado (opcional)")
    expect(element.textContent).toContain("Hasta 150 caracteres")
    expect(element.textContent).toContain("Hasta 4000 caracteres")
    expect(element.querySelector<HTMLInputElement>("#portal-support-create-subject")!.value).toBe(
      ""
    )
    // Own audience: no customer field, no customer identity and no staff affordance.
    expect(element.querySelector("#portal-support-create-orderId")).not.toBeNull()
    expect(element.textContent).not.toMatch(/idCliente|Cliente \(obligatorio\)/)
    expect(element.querySelectorAll('a[href^="/admin"]')).toHaveLength(0)
    expect(element.textContent).not.toMatch(/24 horas|inmediat|garantiz|te responderemos/i)
  })

  it("requires the type, subject and description before any dispatch", async () => {
    const s = await setup()
    const element = await enter(s)
    await s.submit()
    const errors = (field: string) =>
      element.querySelector(`#portal-support-create-${field}-errors`)?.textContent ?? ""
    expect(errors("typeId")).toMatch(/selecciona un tipo/i)
    expect(errors("subject")).toMatch(/obligatori/i)
    expect(errors("description")).toMatch(/obligatori/i)
    // Each error is announced and its id joins the control's accessible description.
    for (const field of ["subject", "description"]) {
      const control = element.querySelector(`#portal-support-create-${field}`)!
      const error = element.querySelector(`#portal-support-create-${field}-errors hlm-field-error`)!
      expect(error.getAttribute("role"), field).toBe("alert")
      expect(control.getAttribute("aria-describedby") ?? "", field).toContain(error.id)
    }
    // The own service stays optional: an empty choice raises no error.
    expect(errors("orderId")).not.toMatch(/obligatori/i)
    s.expectNoPost()
    s.http.expectNone(() => true)
  })

  it("sends the documented own-audience body with idCliente null and no order", async () => {
    const s = await setup()
    const element = await enter(s)
    await s.fill("#portal-support-create-typeId", "4", "change", element)
    await s.fill("#portal-support-create-subject", "  No puedo ver mi factura  ", "input", element)
    await s.fill("#portal-support-create-description", "  Detalle literal\n  ", "input", element)
    await s.submit()
    const post = s.openPost()
    expect(post.request.url).toBe(requestsUrl)
    expect(post.request.transferCache).toBe(false)
    // Registered in the customer's own name: the customer id is null and no idOrden is invented.
    expect(post.request.body).toEqual({
      idCliente: null,
      idTipo: 4,
      asunto: "No puedo ver mi factura",
      descripcion: "Detalle literal"
    })
    expect(Object.keys(post.request.body)).not.toContain("idOrden")
    post.flush(createdDto(23))
    await s.settle()
    expect(s.router.url).toBe("/portal/support/23")
    expect(s.root().textContent).toContain("Detalle de atención")
    s.expectNoPost()
    s.http.expectNone(() => true)
  })

  it("associates one of the customer's own verified services and sends only its id", async () => {
    const s = await setup()
    const element = await enter(s)
    await chooseOrder(s, element, "17")
    expect(element.textContent).not.toContain("Cliente Propio")
    await s.fill("#portal-support-create-typeId", "7", "change", element)
    await s.fill("#portal-support-create-subject", "Servicio asociado", "input", element)
    await s.fill("#portal-support-create-description", "La descripción del caso", "input", element)
    await s.submit()
    const post = s.openPost()
    expect(post.request.body).toEqual({
      idCliente: null,
      idOrden: 17,
      idTipo: 7,
      asunto: "Servicio asociado",
      descripcion: "La descripción del caso"
    })
    post.flush(
      createdDto(24, { idOrden: 17, codigoOrden: "OS-2026-000017", idTipo: 7, tipo: "Queja" })
    )
    await s.settle()
    expect(s.router.url).toBe("/portal/support/24")
    s.expectNoPost()
  })

  it("drops the order again when the customer clears the association", async () => {
    const s = await setup()
    const element = await enter(s)
    await chooseOrder(s, element, "17")
    expect(element.textContent).toContain("Quitar servicio asociado")
    await s.button("Quitar servicio asociado")!.click()
    await s.settle()
    expect(element.textContent).not.toContain("Quitar servicio asociado")
    await s.fill("#portal-support-create-typeId", "4", "change", element)
    await s.fill("#portal-support-create-subject", "Sin servicio", "input", element)
    await s.fill("#portal-support-create-description", "Descripción sin servicio", "input", element)
    await s.submit()
    const post = s.openPost()
    // Clearing the optional choice removes the field entirely instead of sending an empty one.
    expect(post.request.body).toEqual({
      idCliente: null,
      idTipo: 4,
      asunto: "Sin servicio",
      descripcion: "Descripción sin servicio"
    })
    expect(Object.keys(post.request.body)).not.toContain("idOrden")
    post.flush(createdDto(25))
    await s.settle()
    expect(s.router.url).toBe("/portal/support/25")
  })

  it("reports an authoritative refusal without pretending the attention exists", async () => {
    const s = await setup()
    const element = await enter(s)
    await s.fill("#portal-support-create-typeId", "4", "change", element)
    await s.fill("#portal-support-create-subject", "Sin permiso", "input", element)
    await s.fill("#portal-support-create-description", "Descripción sin permiso", "input", element)
    await s.submit()
    s.openPost().flush("forbidden", { status: 403, statusText: "Forbidden" })
    await s.settle()
    const alert = element.querySelector('[role="alert"]')!
    expect(alert.textContent).toMatch(/No tienes permiso/i)
    expect(alert.textContent).not.toMatch(/No pudimos confirmar/i)
    expect(s.router.url).toBe(createUrl)
    s.expectNoPost()
    s.http.expectNone(() => true)
  })

  it("keeps one pending write, blocks duplicates and does not leave the page", async () => {
    const s = await setup()
    const element = await enter(s)
    await s.fill("#portal-support-create-typeId", "4", "change", element)
    await s.fill("#portal-support-create-subject", "Asunto pendiente", "input", element)
    await s.fill("#portal-support-create-description", "Descripción pendiente", "input", element)
    await s.submit()
    const post = s.openPost()
    // A second submit while the first is in flight is refused, not dispatched.
    await s.submit()
    s.expectNoPost()
    expect(s.button("Cancelar")!.disabled).toBe(true)
    await expect(s.router.navigateByUrl("/portal/support")).resolves.toBe(false)
    expect(s.router.url).toBe(createUrl)
    await s.settle()
    expect(s.root().textContent).toContain("Espera")
    post.flush(createdDto(23))
    await s.settle()
    expect(s.router.url).toBe("/portal/support/23")
    s.expectNoPost()
  })

  it("shows an inline error, keeps the draft and never replays the POST", async () => {
    const s = await setup()
    const element = await enter(s)
    await s.fill("#portal-support-create-typeId", "4", "change", element)
    await s.fill("#portal-support-create-subject", "  Asunto conservado  ", "input", element)
    await s.fill("#portal-support-create-description", "Descripción conservada", "input", element)
    await s.submit()
    const post = s.openPost()
    post.flush("No se pudo", { status: 400, statusText: "Bad Request" })
    await s.settle()
    expect(element.querySelector('[role="alert"]')?.textContent).toMatch(/Revisa el asunto/i)
    expect(element.querySelector<HTMLInputElement>("#portal-support-create-subject")!.value).toBe(
      "  Asunto conservado  "
    )
    expect(
      element.querySelector<HTMLTextAreaElement>("#portal-support-create-description")!.value
    ).toBe("Descripción conservada")
    expect(s.router.url).toBe(createUrl)
    // Ambiguous or not, the page never resends the POST by itself.
    s.expectNoPost()
    s.http.expectNone(() => true)
  })

  it("marks an unconfirmed outcome and still never replays the write", async () => {
    const s = await setup()
    const element = await enter(s)
    await s.fill("#portal-support-create-typeId", "4", "change", element)
    await s.fill("#portal-support-create-subject", "Asunto ambiguo", "input", element)
    await s.fill("#portal-support-create-description", "Descripción ambigua", "input", element)
    await s.submit()
    const post = s.openPost()
    post.flush("unavailable", { status: 503, statusText: "Service Unavailable" })
    await s.settle()
    const alert = element.querySelector('[role="alert"]')!
    expect(alert.textContent).toMatch(/No pudimos confirmar/i)
    expect(alert.textContent).toMatch(/no repetimos el envío/i)
    expect(alert.textContent).toMatch(/revisa/i)
    s.expectNoPost()
    expect(s.router.url).toBe(createUrl)
    s.http.expectNone(() => true)
  })

  it("fences a pending write when the session is replaced", async () => {
    const s = await setup()
    const element = await enter(s)
    await s.fill("#portal-support-create-typeId", "4", "change", element)
    await s.fill("#portal-support-create-subject", "Asunto de la sesión anterior", "input", element)
    await s.fill("#portal-support-create-description", "Descripción anterior", "input", element)
    await s.submit()
    const post = s.openPost()
    s.session.set(customer("Otra identidad", 4102444900000))
    await s.settle()
    // The store's session fence unsubscribes the write, so no POST survives the replacement and
    // no answer from the previous identity can navigate or report.
    expect(post.cancelled).toBe(true)
    // The replaced session starts from its own empty draft and its own reads.
    expect(element.querySelector<HTMLInputElement>("#portal-support-create-subject")!.value).toBe(
      ""
    )
    expect(s.http.match(request => request.url === typesUrl).length).toBeGreaterThan(0)
    s.http
      .match(request => request.method === "GET")
      .forEach(request => request.flush(request.request.url === typesUrl ? types : ordersPage()))
    await s.settle()
    expect(s.router.url).toBe(createUrl)
    s.expectNoPost()
  })

  it("dispatches no read or write on the server platform", async () => {
    const s = await setup({ server: true })
    await s.settle()
    expect(s.router.url).toBe(createUrl)
    await s.submit()
    s.http.expectNone(() => true)
  })
})

describe("Portal own-attention creation without an identified answer", () => {
  /**
   * The real transport refuses an id-less `AtencionResponse`, so this defensive branch — the answer
   * was accepted but carries no usable id — is exercised with store doubles instead of HTTP.
   */
  async function setupDouble() {
    TestBed.resetTestingModule()
    const session = signal<AuthSession | null>(customer())
    let captured: unknown = null
    const detail: SupportDetail = {
      request: {
        id: 0,
        customerId: 88,
        customerName: "Cliente Propio",
        orderId: null,
        orderCode: null,
        requestTypeId: 4,
        requestTypeName: "Consulta",
        requiresResponse: true,
        state: "RECIBIDA",
        stateName: "Recibida",
        subject: "Asunto",
        description: "Descripción",
        registeredAt: new Date(stamp),
        closedAt: null
      },
      followUps: []
    }
    const support = {
      writing: () => false,
      selectRequestTypes: () => ({
        result: [{ id: 4, name: "Consulta", requiresResponse: true }],
        loading: false,
        refreshing: false,
        error: undefined,
        expires: Date.now() + 60000
      }),
      observeRequestTypes: () =>
        of(Result.success([{ id: 4, name: "Consulta", requiresResponse: true }])),
      createRequest: (params: unknown) => {
        captured = params
        return of(Result.success(detail))
      }
    }
    const orders = {
      selectOrders: () => ({
        result: { items: [], total: 0, offset: 0, limit: 20 },
        loading: false,
        refreshing: false,
        error: undefined,
        expires: Date.now() + 60000
      }),
      observeOrders: () => of(Result.success({ items: [], total: 0, offset: 0, limit: 20 }))
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: "portal/support", component: ListStub },
          { path: "portal/support/new", component: PortalSupportCreatePage },
          { path: "portal/support/:id", component: DetailStub }
        ]),
        { provide: AuthStore, useValue: { session: () => session() } },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
        { provide: SupportRequestsStore, useValue: support },
        { provide: ServiceOrdersStore, useValue: orders }
      ]
    })
    const harness = await RouterTestingHarness.create(createUrl)
    const settle = async () => {
      await new Promise(resolve => setTimeout(resolve, 0))
      harness.detectChanges()
      await harness.fixture.whenStable()
      harness.detectChanges()
    }
    await settle()
    return { harness, settle, captured: () => captured }
  }

  it("returns to the list with the confirmed message instead of guessing an id", async () => {
    const s = await setupDouble()
    const element = s.harness.routeNativeElement!
    const select = element.querySelector<HTMLSelectElement>("#portal-support-create-typeId")!
    select.value = "4"
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await s.settle()
    const subject = element.querySelector<HTMLInputElement>("#portal-support-create-subject")!
    subject.value = "Sin identificador"
    subject.dispatchEvent(new Event("input", { bubbles: true }))
    subject.dispatchEvent(new Event("blur"))
    await s.settle()
    const description = element.querySelector<HTMLTextAreaElement>(
      "#portal-support-create-description"
    )!
    description.value = "El servidor no devolvió un identificador"
    description.dispatchEvent(new Event("input", { bubbles: true }))
    description.dispatchEvent(new Event("blur"))
    await s.settle()
    element
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await s.settle()
    expect(s.captured()).toEqual({
      customerId: null,
      orderId: null,
      requestTypeId: 4,
      subject: "Sin identificador",
      description: "El servidor no devolvió un identificador"
    })
    expect(TestBed.inject(Router).url).toBe("/portal/support?creada=1")
    expect(s.harness.routeNativeElement!.textContent).toContain("Lista de soporte")
  })
})
