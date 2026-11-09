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
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { CustomerHistoryStore } from "@/app/features/customers/presentation/state/customer-history.store"
import { provideFieldOperationsReads } from "@/app/features/field-operations/field-operations.providers"
import { provideOperationsRequestReads } from "../../../operations.providers"
import { createCaller } from "../../state/service-orders-create.store.testing"
import { ServiceOrdersStore } from "../../state/service-orders.store"
import { ServiceOrderDetailPage } from "./service-order-detail-page"
import { orderDetailDto, orderDetailApi } from "./service-order-detail-page.testing"

export const reasonsUrl = "https://api.example.test/api/catalogos/motivos-reprogramacion"
export const staffUrl = "https://api.example.test/api/personal"
export const reasonDto = { idMotivo: 3, nombre: "Cambio solicitado", descripcion: null }
export const staffDto = (id = 23, active = true) => ({
  idPersonal: id,
  nombre: `Personal ${id}`,
  documento: `DOC-${id}`,
  telefono: null,
  correo: null,
  idioma: "es",
  fechaIngreso: null,
  activo: active,
  idUsuario: 90 + id,
  disponibilidad: [],
  fechaCreacion: "2026-01-01T00:00:00Z"
})
export const staffPageDto = (ids = [23], page = 0, size = 20, total = ids.length) => ({
  contenido: ids.map(id => staffDto(id)),
  pagina: page,
  tamanio: size,
  totalElementos: total,
  totalPaginas: Math.ceil(total / size)
})
export const manualDetailDto = (id = 17) => {
  const dto = orderDetailDto(id)
  dto.orden.asignados = [
    { idPersonal: 21, nombre: "Personal capturado", telefono: null, rol: "RESPONSABLE" }
  ]
  return dto
}
@Component({ selector: "app-manual-order-away", template: "<p>Otra ruta</p>" })
class Away {}
export async function setupManual(
  options: { url?: string; server?: boolean; guest?: boolean } = {}
) {
  const session = new BehaviorSubject<AuthSession | null>(options.guest ? null : createCaller())
  const success = vi.fn(),
    history = { invalidateCustomer: vi.fn() }
  const authFactory = vi.fn(() => ({ session: () => session.value }))
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: () => {}
  })
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideLocationMocks(),
      provideOperationsRequestReads(),
      provideFieldOperationsReads(),
      { provide: API_URL, useValue: "https://api.example.test" },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      { provide: AuthStore, useFactory: authFactory },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      { provide: CustomerHistoryStore, useValue: history },
      provideRouter([
        {
          path: "admin/operations/orders/:id",
          component: ServiceOrderDetailPage,
          providers: [{ provide: HotToastService, useValue: { success } }]
        },
        { path: "away", component: Away }
      ])
    ]
  })
  const harness = await RouterTestingHarness.create(options.url ?? "/admin/operations/orders/17")
  const http = TestBed.inject(HttpTestingController),
    store = TestBed.inject(ServiceOrdersStore)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
    // Signal Forms settles its async submission after the HTTP result microtask.
    await Promise.resolve()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const root = () => harness.routeNativeElement!
  const dialog = () =>
    document.querySelector<HTMLElement>(
      "app-service-order-schedule-dialog, app-service-order-team-dialog"
    )
  const button = (name: string, within: ParentNode = root()) =>
    [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === name || b.getAttribute("aria-label") === name
    )
  const click = async (name: string, within: ParentNode = root()) => {
    const b = button(name, within)
    expect(b, name).toBeDefined()
    expect(b!.disabled).toBe(false)
    b!.click()
    await settle()
  }
  const fill = async (id: string, value: string | boolean) => {
    const control = dialog()!.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)
    expect(control, id).not.toBeNull()
    if (typeof value === "boolean") (control as HTMLInputElement).checked = value
    else control!.value = value
    // A native user edit emits input before change, including selects/checkboxes.
    control!.dispatchEvent(new Event("input", { bubbles: true }))
    control!.dispatchEvent(new Event("change", { bubbles: true }))
    control!.dispatchEvent(new Event("blur"))
    await settle()
  }
  const submit = async () => {
    dialog()!
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  const read = (id = 17) =>
    http.expectOne(r => r.url === `${orderDetailApi}/${id}` && r.method === "GET")
  const put = (kind: "schedule" | "team") =>
    http.expectOne(
      r =>
        r.url === `${orderDetailApi}/17/${kind === "schedule" ? "programacion" : "asignaciones"}` &&
        r.method === "PUT"
    )
  const staffRead = () => http.expectOne(r => r.url === staffUrl && r.method === "GET")
  const openStaffSearch = async () => {
    const trigger = dialog()!.querySelector<HTMLButtonElement>("#order-team-search")
    expect(trigger).not.toBeNull()
    trigger!.click()
    await settle()
  }
  const selectStaff = async (name: string) => {
    await openStaffSearch()
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      item => item.textContent?.trim() === name
    )
    expect(option, name).toBeDefined()
    option!.click()
    await settle()
  }
  const open = async (kind: "schedule" | "team") => {
    await click(kind === "schedule" ? "Programar orden" : "Reemplazar equipo")
    expect(dialog()).not.toBeNull()
  }
  const navigate = async (url: string) => {
    await TestBed.inject(Router).navigateByUrl(url)
    await settle()
  }
  const overlay = () => getDebugNode(dialog()!)!.injector.get(CdkDialogRef).overlayRef
  return {
    harness,
    http,
    store,
    session,
    success,
    history,
    authFactory,
    settle,
    root,
    dialog,
    button,
    click,
    fill,
    submit,
    read,
    put,
    staffRead,
    openStaffSearch,
    selectStaff,
    open,
    navigate,
    overlay
  }
}
