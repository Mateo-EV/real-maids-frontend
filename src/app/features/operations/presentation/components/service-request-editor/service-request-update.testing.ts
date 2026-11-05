import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { provideLocationMocks } from "@angular/common/testing"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, getDebugNode, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { HotToastService } from "@ngxpert/hot-toast"
import { BehaviorSubject } from "rxjs"
import { expect, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { CUSTOMER_REPOSITORY } from "@/app/features/customers/domain/repositories/customer.repository"
import { PROPERTY_REPOSITORY } from "@/app/features/customers/domain/repositories/property.repository"
import { CustomerRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/customer.repository-impl"
import { PropertyRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/property.repository-impl"
import { CustomerHistoryStore } from "@/app/features/customers/presentation/state/customer-history.store"
import { provideServiceCatalogReads } from "@/app/features/service-catalog/service-catalog.providers"
import { provideOperationsRequestReads } from "../../../operations.providers"
import { ServiceRequestDetailPage } from "../../pages/service-request-detail-page/service-request-detail-page"
import { ServiceRequestsStore } from "../../state/service-requests.store"

export const origin = "https://api.example.test"
export const requests = `${origin}/api/solicitudes`
export const properties = `${origin}/api/clientes/8/propiedades`
export const types = `${origin}/api/catalogos/tipos-servicio`
export const detailUrl = "/admin/operations/requests/17"
export const caller = (id = 19, name = "Caller", deadline = 4102444800000) =>
  AuthSession.create(name, `caller${id}@example.test`, null, deadline, id)
export const requestDto = (id = 17) => ({
  idSolicitud: id,
  idCliente: 8,
  cliente: "Cliente capturado",
  idPropiedad: 31,
  propiedad: "Propiedad capturada",
  idTipoServicio: 4,
  tipoServicio: "Tipo capturado",
  descripcion: "Descripción registrada" as string | null,
  fechaDeseada: "2024-02-29" as string | null,
  estado: "registrada",
  registradoPor: "Operadora devuelta",
  fechaRegistro: "2026-03-02T04:30:00Z",
  fechaActualizacion: null
})
export const propertyDto = (id = 31, active = true, owner = 8) => ({
  idPropiedad: id,
  idCliente: owner,
  alias: `Propiedad ${id}`,
  direccion: `Dirección ${id}`,
  ciudad: null,
  estadoRegion: null,
  codigoPostal: null,
  areaM2: null,
  numeroAmbientes: null,
  numeroBanos: null,
  instruccionesAcceso: "SYNTHETIC-ACCESS",
  codigoPuerta: "SYNTHETIC-CODE",
  tieneMascotas: false,
  activo: active,
  fechaCreacion: "2026-01-01T00:00:00Z"
})
export const typeDto = (id = 4) => ({
  idTipoServicio: id,
  nombre: `Tipo ${id}`,
  descripcion: null,
  duracionEstimadaMinutos: 90,
  idCategoria: 2,
  categoria: "Categoría"
})
@Component({ template: "<p>Otra ruta</p>" })
class Away {}

// Shared public-DOM test harness only. No component internals, copied store
// results, inferred customer identity or production composition modifications.
export async function setupUpdate(
  options: { server?: boolean; guest?: boolean; url?: string; browserHistory?: boolean } = {}
) {
  const session = new BehaviorSubject<AuthSession | null>(options.guest ? null : caller())
  const success = vi.fn()
  const history = { invalidateCustomer: vi.fn() }
  const authFactory = vi.fn(() => ({ session: () => session.value }))
  const observeSession = vi.fn(() => session)
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      ...(options.browserHistory ? provideLocationMocks() : []),
      provideOperationsRequestReads(),
      provideServiceCatalogReads(),
      { provide: CUSTOMER_REPOSITORY, useExisting: CustomerRepositoryImpl },
      { provide: PROPERTY_REPOSITORY, useExisting: PropertyRepositoryImpl },
      { provide: CustomerHistoryStore, useValue: history },
      { provide: API_URL, useValue: origin },
      { provide: AuthStore, useFactory: authFactory },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: observeSession } },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      provideRouter([
        {
          path: "admin/operations/requests/:id",
          component: ServiceRequestDetailPage,
          providers: [{ provide: HotToastService, useValue: { success } }]
        },
        { path: "away", component: Away }
      ])
    ]
  })
  const harness = await RouterTestingHarness.create(options.url ?? detailUrl)
  // Harness navigation does not bootstrap the application's location listener.
  // Enable it only for tests that exercise actual popstate navigation.
  if (options.browserHistory) TestBed.inject(Router).initialNavigation()
  const http = TestBed.inject(HttpTestingController)
  const store = TestBed.inject(ServiceRequestsStore)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  const root = () => harness.routeNativeElement!
  const editor = () => document.querySelector<HTMLElement>("app-service-request-editor")
  const dialog = () => {
    expect(editor(), "Same service-request editor must be mounted in edit mode").not.toBeNull()
    return editor()!
  }
  const button = (label: string, within: ParentNode = root()) =>
    [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label
    )
  const click = async (label: string, within: ParentNode = root()) => {
    const control = button(label, within)
    expect(control, label).toBeDefined()
    expect(control!.disabled, label).toBe(false)
    control!.click()
    await settle()
  }
  const field = (key: string) => {
    const control = dialog().querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(`#request-${key}`)
    expect(control, `Public labeled ${key} field`).not.toBeNull()
    return control!
  }
  const fill = async (key: string, value: string) => {
    const control = field(key)
    control.value = value
    control.dispatchEvent(
      new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true })
    )
    control.dispatchEvent(new Event("blur"))
    await settle()
  }
  const injectChoice = async (key: string, value: string) => {
    const select = field(key) as HTMLSelectElement
    const option = document.createElement("option")
    option.value = value
    option.textContent = "Unverified choice"
    select.append(option)
    await fill(key, value)
  }
  const submit = async () => {
    const form = dialog().querySelector("form")
    expect(form, "Signal Form public submit").not.toBeNull()
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  const navigate = async (url: string) => {
    await TestBed.inject(Router).navigateByUrl(url)
    await settle()
  }
  const read = (id = 17) => http.expectOne(r => r.url === `${requests}/${id}` && r.method === "GET")
  const put = () => http.expectOne(r => r.url === `${requests}/17` && r.method === "PUT")
  const open = async () => {
    await click("Editar solicitud")
    dialog()
  }
  const choices = async (propertyRows = [propertyDto()], typeRows = [typeDto()]) => {
    http.expectOne(properties).flush(propertyRows)
    http.expectOne(types).flush(typeRows)
    await settle()
    http.expectNone(r => r.url === `${origin}/api/clientes` || /^.*\/api\/clientes\/8$/.test(r.url))
  }
  const overlay = () => getDebugNode(dialog())!.injector.get(CdkDialogRef).overlayRef
  await settle()
  return {
    session,
    success,
    history,
    authFactory,
    observeSession,
    harness,
    http,
    store,
    settle,
    root,
    editor,
    dialog,
    button,
    click,
    field,
    fill,
    injectChoice,
    submit,
    navigate,
    read,
    put,
    open,
    choices,
    overlay
  }
}
