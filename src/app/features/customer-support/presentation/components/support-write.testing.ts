import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { getDebugNode, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { HotToastService } from "@ngxpert/hot-toast"
import { BehaviorSubject } from "rxjs"
import { expect, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { CUSTOMER_REPOSITORY } from "@/app/features/customers/domain/repositories/customer.repository"
import { CustomerRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/customer.repository-impl"
import { provideCustomerSupportReads } from "../../customer-support.providers"
import { SupportRequestsPage } from "../pages/support-requests-page/support-requests-page"
import { SupportRequestDetailPage } from "../pages/support-request-detail-page/support-request-detail-page"

export const origin = "https://api.example.test"
export const requestsUrl = `${origin}/api/atenciones`
export const typesUrl = `${origin}/api/catalogos/tipos-atencion`
export const customersUrl = `${origin}/api/clientes`
export const inboxUrl = "/admin/support"
export const detailUrl = "/admin/support/17"
export const deadline = 4102444800000

export const caller = (id = 19, expires = deadline, name = "Caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, expires, id)

/** AtencionResponse wire DTO; the adapter rejects any partial or misaligned page. */
export const requestDto = (id = 17, overrides: Record<string, unknown> = {}) => ({
  idAtencion: id,
  idCliente: 8,
  cliente: "Cliente autorizado",
  idOrden: null,
  codigoOrden: null,
  idTipo: 4,
  tipo: "Consulta",
  requiereRespuesta: true,
  estado: "RECIBIDA",
  estadoNombre: "Recibida",
  asunto: "No puedo ver mi factura",
  descripcion: "Descripción literal de la atención",
  fechaRegistro: "2026-03-02T04:30:00Z",
  fechaCierre: null as string | null,
  ...overrides
})

export const followUpDto = (
  id = 90,
  autor: string | null = "Agente de soporte",
  mensaje = "Revisando el caso"
) => ({ idSeguimiento: id, autor, delCliente: false, mensaje, fecha: "2026-03-03T09:00:00Z" })

export const detailDto = (
  id = 17,
  overrides: Record<string, unknown> = {},
  followUps: unknown[] = [followUpDto()]
) => ({ atencion: requestDto(id, overrides), seguimiento: followUps })

export const pageDto = (pagina = 0, tamanio = 20, total = 1, first = requestDto()) => ({
  contenido: Array.from(
    { length: Math.min(tamanio, Math.max(0, total - pagina * tamanio)) },
    (_, i) => (i === 0 ? first : requestDto(1000 + i, { asunto: `Asunto ${1000 + i}` }))
  ),
  pagina,
  tamanio,
  totalElementos: total,
  totalPaginas: Math.ceil(total / tamanio)
})

export const types = [
  { idTipo: 4, nombre: "Consulta", requiereRespuesta: true },
  { idTipo: 7, nombre: "Queja", requiereRespuesta: true }
]

export const customerDto = (id = 8, name = `Cliente ${id}`, active = true) => ({
  idCliente: id,
  nombre: name,
  tipo: "residencial",
  correo: null,
  telefono: null,
  activo: active,
  idUsuario: null,
  fechaCreacion: "2026-01-01T00:00:00Z",
  fechaActualizacion: null,
  idProspecto: null,
  identificacionFiscal: null,
  sistemaOrigen: null,
  idExterno: null,
  usuarioRegistro: 19
})

export const customerPageDto = (
  contenido: unknown[] = [customerDto()],
  pagina = 0,
  tamanio = 20,
  total = contenido.length
) => ({
  contenido,
  pagina,
  tamanio,
  totalElementos: total,
  totalPaginas: Math.ceil(total / tamanio)
})

/**
 * Real root stores, use cases, repositories and HTTP validators behind the real pages.
 * Only auth identity and route-local feedback are replaced, so every write assertion
 * observes the documented wire contract instead of a store double.
 */
export async function setupSupportWrites(
  url = inboxUrl,
  options: { server?: boolean; guest?: boolean } = {}
) {
  const session = new BehaviorSubject<AuthSession | null>(options.guest ? null : caller())
  const success = vi.fn()
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideCustomerSupportReads(),
      { provide: CUSTOMER_REPOSITORY, useExisting: CustomerRepositoryImpl },
      { provide: HotToastService, useValue: { success } },
      { provide: API_URL, useValue: origin },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      provideRouter([
        { path: "admin/support", component: SupportRequestsPage },
        { path: "admin/support/:id", component: SupportRequestDetailPage }
      ])
    ]
  })
  const http = TestBed.inject(HttpTestingController)
  const harness = await RouterTestingHarness.create(url)
  /**
   * The support KPI block is a real consumer of the inbox: it reads four module totals and
   * revalidates them after every invalidation. Draining them here keeps each spec's exact
   * request assertions and `http.verify()` about the page read it is actually testing.
   */
  const flushMetrics = () =>
    http
      .match(request => request.url === requestsUrl && request.params.get("tamanio") === "1")
      .forEach((pending, index) => pending.flush(pageDto(0, 1, [3, 1, 7, 11][index] ?? 0)))
  // A post-await write continuation is not tracked by whenStable, so drain the
  // macrotask/microtask queues before re-rendering the overlay.
  const settle = async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
    flushMetrics()
    harness.detectChanges()
  }
  await settle()
  const root = () => harness.routeNativeElement!
  const dialog = (selector: string) => document.querySelector<HTMLElement>(selector)
  const button = (label: string, within: ParentNode = root()) =>
    [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
  const click = async (label: string, within: ParentNode = root()) => {
    const control = button(label, within)
    expect(control, label).toBeDefined()
    expect(control!.disabled, label).toBe(false)
    control!.click()
    await settle()
  }
  const fill = async (
    selector: string,
    value: string,
    kind: "input" | "change" = "input",
    within: ParentNode = document
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
  const submit = async (within: ParentNode = document) => {
    const form = within.querySelector("form")
    expect(form, "Signal Form exposed through DOM").not.toBeNull()
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  const overlay = (element: HTMLElement) =>
    getDebugNode(element)!.injector.get(CdkDialogRef).overlayRef
  const posts = () => http.match(request => request.method === "POST")
  const patches = () => http.match(request => request.method === "PATCH")
  return {
    http,
    session,
    success,
    harness,
    settle,
    root,
    dialog,
    button,
    click,
    fill,
    submit,
    overlay,
    posts,
    patches
  }
}
