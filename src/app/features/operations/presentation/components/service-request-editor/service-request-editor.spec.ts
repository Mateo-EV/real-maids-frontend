import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { Component, getDebugNode, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { HotToastService } from "@ngxpert/hot-toast"
import { BehaviorSubject, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { CUSTOMER_REPOSITORY } from "@/app/features/customers/domain/repositories/customer.repository"
import { PROPERTY_REPOSITORY } from "@/app/features/customers/domain/repositories/property.repository"
import { CustomerRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/customer.repository-impl"
import { PropertyRepositoryImpl } from "@/app/features/customers/infrastructure/repositories/property.repository-impl"
import { CustomerHistoryStore } from "@/app/features/customers/presentation/state/customer-history.store"
import { CustomersStore } from "@/app/features/customers/presentation/state/customers.store"
import { CustomerPropertiesStore } from "@/app/features/customers/presentation/state/customer-properties.store"
import { provideServiceCatalogReads } from "@/app/features/service-catalog/service-catalog.providers"
import { ServiceCatalogStore } from "@/app/features/service-catalog/presentation/state/service-catalog.store"
import { provideOperationsRequestReads } from "../../../operations.providers"
import { ServiceRequestsStore } from "../../state/service-requests.store"
import { ServiceRequestsPage } from "../../pages/service-requests-page/service-requests-page"

const origin = "https://api.example.test"
const requests = `${origin}/api/solicitudes`
const customers = `${origin}/api/clientes`
const types = `${origin}/api/catalogos/tipos-servicio`
const inbox = "/admin/operations/requests"
const caller = (id = 19, name = "Caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, 4102444800000, id)
const customer = (id = 8) => ({
  idCliente: id,
  nombre: `Cliente ${id}`,
  tipo: "residencial",
  correo: null,
  telefono: null,
  activo: true,
  idUsuario: null,
  fechaCreacion: "2026-01-01T00:00:00Z",
  fechaActualizacion: null,
  idProspecto: null,
  identificacionFiscal: null,
  sistemaOrigen: null,
  idExterno: null,
  usuarioRegistro: 19
})
const property = (id = 31, owner = 8, active = true) => ({
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
  instruccionesAcceso: "SYNTHETIC-ACCESS-NOT-FOR-SELECTOR",
  codigoPuerta: "SYNTHETIC-CODE",
  tieneMascotas: false,
  activo: active,
  fechaCreacion: "2026-01-01T00:00:00Z"
})
const service = {
  idTipoServicio: 4,
  nombre: "Tipo real",
  descripcion: null,
  duracionEstimadaMinutos: 90,
  idCategoria: 2,
  categoria: "Categoría real"
}
const dto = (id = 17) => ({
  idSolicitud: id,
  idCliente: 8,
  cliente: "Cliente 8",
  idPropiedad: 31,
  propiedad: "Propiedad 31",
  idTipoServicio: 4,
  tipoServicio: "Tipo real",
  descripcion: null,
  fechaDeseada: null,
  estado: "registrada",
  registradoPor: "Operador devuelto",
  fechaRegistro: "2026-03-02T04:30:00Z",
  fechaActualizacion: null
})
const page = (contenido: unknown[], pagina = 0, tamanio = 20, total = contenido.length) => ({
  contenido,
  pagina,
  tamanio,
  totalElementos: total,
  totalPaginas: Math.ceil(total / tamanio)
})
@Component({ template: "<p>Otra ruta</p>" })
class Away {}

// Real root stores, use cases, repositories and HTTP validators. Only auth identity,
// route-local feedback and unrelated history invalidation are replaced here.
// app.config.spec separately protects the production root catalog alias + Bearer.
async function setup(options: { server?: boolean; guest?: boolean } = {}) {
  const session = new BehaviorSubject<AuthSession | null>(options.guest ? null : caller())
  const success = vi.fn()
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideOperationsRequestReads(),
      provideServiceCatalogReads(),
      { provide: CUSTOMER_REPOSITORY, useExisting: CustomerRepositoryImpl },
      { provide: PROPERTY_REPOSITORY, useExisting: PropertyRepositoryImpl },
      { provide: CustomerHistoryStore, useValue: { invalidateCustomer: vi.fn() } },
      { provide: API_URL, useValue: origin },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" },
      provideRouter([
        {
          path: "admin/operations/requests",
          component: ServiceRequestsPage,
          providers: [{ provide: HotToastService, useValue: { success } }]
        },
        { path: "away", component: Away }
      ])
    ]
  })
  const harness = await RouterTestingHarness.create(inbox)
  const http = TestBed.inject(HttpTestingController)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  const dialog = () => {
    const element = document.querySelector<HTMLElement>("app-service-request-editor")
    expect(element, "Create-only editor must be mounted").not.toBeNull()
    return element!
  }
  const click = async (label: string, within: ParentNode = harness.routeNativeElement!) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.getAttribute("aria-label") === label || b.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    expect(button!.disabled, label).toBe(false)
    button!.click()
    await settle()
  }
  const field = (key: string) => {
    const control = dialog().querySelector<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >(`#request-${key}`)
    expect(control, `Labeled public field ${key}`).not.toBeNull()
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
  const submit = async () => {
    const form = dialog().querySelector("form")
    expect(form, "Signal Form exposed through DOM").not.toBeNull()
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  const getPage = (url: string, pagina = 0, tamanio = 20) => {
    const pending = http.expectOne(
      r =>
        r.url === url &&
        r.method === "GET" &&
        r.params.get("pagina") === String(pagina) &&
        r.params.get("tamanio") === String(tamanio)
    )
    expect(pending.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    expect(pending.request.transferCache).toBe(false)
    return pending
  }
  const open = async () => {
    await click("Crear solicitud")
    dialog()
  }
  const choices = async () => {
    getPage(customers).flush(page([customer()]))
    http.expectOne(types).flush([service])
    await settle()
    await fill("customerId", "8")
    http.expectOne(`${customers}/8/propiedades`).flush([property(), property(32, 8, false)])
    await settle()
    await fill("propertyId", "31")
    await fill("serviceTypeId", "4")
  }
  const overlay = () => getDebugNode(dialog())!.injector.get(CdkDialogRef).overlayRef
  await settle()
  if (!options.server && !options.guest) {
    // Effective inbox page differs from the requested size; success must refresh
    // the observed original key once, not issue an additional page-owned reload.
    getPage(requests).flush(page([dto()], 0, 5))
    await settle()
  }
  return {
    harness,
    http,
    session,
    success,
    settle,
    dialog,
    click,
    field,
    fill,
    submit,
    getPage,
    open,
    choices,
    overlay
  }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController).verify()
  } finally {
    vi.restoreAllMocks()
  }
})

describe("WP7 T5 S1-S4 create-only request consumer", () => {
  it("projects one lazy launcher in catalogControls, blank required choices and actual root catalog data", async () => {
    const s = await setup()
    s.http.expectNone(() => true)
    const launcher = s.harness.routeNativeElement!.querySelector("[catalogControls]")
    expect(launcher?.textContent).toContain("Crear solicitud")
    await s.open()
    await s.click("Crear solicitud")
    expect(document.querySelectorAll("app-service-request-editor")).toHaveLength(1)
    const content = s.dialog().closest('[data-slot="dialog-content"]')
    expect(content?.classList.contains("max-h-[90dvh]")).toBe(true)
    expect(content?.classList.contains("overflow-y-auto")).toBe(true)
    expect(s.dialog().querySelector("[hlmDialogTitle]")?.textContent).toContain("Crear solicitud")
    expect(s.dialog().textContent).toMatch(/Cargando clientes/)
    expect(s.dialog().textContent).toMatch(/Cargando tipos/)
    s.getPage(customers).flush(page([customer()]))
    s.http.expectOne(types).flush([service])
    await s.settle()
    for (const key of ["customerId", "propertyId", "serviceTypeId"]) {
      expect(s.field(key).value).toBe("")
      expect(s.dialog().querySelector(`label[for="request-${key}"]`)).not.toBeNull()
    }
    expect(s.dialog().textContent).toContain("Cliente 8")
    expect(s.dialog().textContent).toContain("Tipo real")
    expect(s.dialog().querySelector('option[value="8"]')?.textContent?.trim()).toBe("Cliente 8")
    expect(s.dialog().querySelector('option[value="4"]')?.textContent?.trim()).toBe("Tipo real")
    expect(s.dialog().textContent).not.toMatch(/Editar|Precio|Registrado por|SYNTHETIC/)
    s.http.expectNone(r => r.url.includes("propiedades"))
    await s.submit()
    s.http.expectNone(r => r.method !== "GET")
    expect(s.dialog().textContent).toMatch(/Selecciona/)
    expect(s.harness.routeDebugElement!.injector.get(ServiceRequestsStore)).toBe(
      TestBed.inject(ServiceRequestsStore)
    )
    expect(TestBed.inject(CustomersStore)).toBe(TestBed.inject(CustomersStore))
    expect(TestBed.inject(CustomerPropertiesStore)).toBe(TestBed.inject(CustomerPropertiesStore))
    expect(TestBed.inject(ServiceCatalogStore)).toBe(TestBed.inject(ServiceCatalogStore))
  })

  it("sends only five trimmed fields, guards pending dismissal and refreshes the observed inbox exactly once on success", async () => {
    const s = await setup()
    await s.open()
    await s.choices()
    expect(s.dialog().textContent).not.toMatch(/SYNTHETIC-ACCESS|SYNTHETIC-CODE|Propiedad 32/)
    await s.fill("description", " <b>Trabajo literal</b> ")
    // A past but real calendar date is intentionally accepted locally: the
    // backend, not browser-today or an invented timezone, owns past-date policy.
    await s.fill("desiredDate", "2024-02-29")
    expect(s.field("desiredDate").getAttribute("min")).toBeNull()
    await s.submit()
    await s.submit()
    const post = s.http.expectOne(r => r.url === requests && r.method === "POST")
    expect(post.request.body).toEqual({
      idCliente: 8,
      idPropiedad: 31,
      idTipoServicio: 4,
      descripcion: "<b>Trabajo literal</b>",
      fechaDeseada: "2024-02-29"
    })
    expect(post.request.transferCache).toBe(false)
    expect(s.success).not.toHaveBeenCalled()
    expect(TestBed.inject(ServiceRequestsStore).writing()).toBe(true)
    for (const key of ["customerId", "propertyId", "serviceTypeId", "description", "desiredDate"])
      expect(s.field(key).disabled).toBe(true)
    const cancel = [...s.dialog().querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === "Cancelar"
    )!
    expect(cancel.disabled).toBe(true)
    cancel.click()
    ;(s.overlay().keydownEvents() as Subject<KeyboardEvent>).next(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    )
    ;(s.overlay().backdropClick() as Subject<MouseEvent>).next(new MouseEvent("click"))
    ;(s.overlay().outsidePointerEvents() as Subject<MouseEvent>).next(new MouseEvent("click"))
    await s.settle()
    expect(post.cancelled).toBe(false)
    expect(s.dialog()).not.toBeNull()
    s.http.expectNone(() => true)
    post.flush({ ...dto(18), descripcion: "<b>Trabajo literal</b>", fechaDeseada: "2024-02-29" })
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Solicitud creada correctamente.")
    s.getPage(requests).flush(page([dto(18)], 0, 5))
    await s.settle()
    s.http.expectNone(() => true)
    expect(s.harness.routeNativeElement!.textContent).toContain("1–1 de 1")
  })

  it("maps both optional blanks to null without adding state, actor or date defaults", async () => {
    const s = await setup()
    await s.open()
    await s.choices()
    await s.fill("description", "   ")
    await s.submit()
    const post = s.http.expectOne(r => r.method === "POST")
    expect(post.request.body).toEqual({
      idCliente: 8,
      idPropiedad: 31,
      idTipoServicio: 4,
      descripcion: null,
      fechaDeseada: null
    })
    post.flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.success).not.toHaveBeenCalled()
    expect(s.dialog().querySelector('[role="alert"]')?.textContent).toMatch(/permiso/i)
    s.http.expectNone(() => true)
  })

  it("rejects overlong description and unverified property/type IDs before HTTP", async () => {
    const s = await setup()
    await s.open()
    await s.choices()
    await s.fill("description", "x".repeat(2001))
    await s.submit()
    expect(s.dialog().textContent).toContain("2000")
    s.http.expectNone(r => r.method === "POST")
    await s.fill("description", "Borrador")
    for (const key of ["propertyId", "serviceTypeId"]) {
      const select = s.field(key) as HTMLSelectElement
      const injected = document.createElement("option")
      injected.value = "999"
      injected.textContent = "Unverified"
      select.append(injected)
      await s.fill(key, "999")
      await s.submit()
      s.http.expectNone(r => r.method === "POST")
    }
    expect(s.success).not.toHaveBeenCalled()
  })

  it("accepts exactly 2000 trimmed description characters and rejects impossible calendar input without a client-clock policy", async () => {
    const s = await setup()
    await s.open()
    await s.choices()
    const date = s.field("desiredDate") as HTMLInputElement
    // Bypass native date sanitization to exercise declarative validation too.
    date.type = "text"
    await s.fill("desiredDate", "2025-02-29")
    await s.submit()
    s.http.expectNone(r => r.method === "POST")
    expect(s.dialog().textContent).toMatch(/fecha|calendario/i)
    await s.fill("desiredDate", "")
    await s.fill("description", "  " + "x".repeat(2000) + "  ")
    await s.submit()
    const post = s.http.expectOne(r => r.method === "POST")
    expect(post.request.body).toEqual({
      idCliente: 8,
      idPropiedad: 31,
      idTipoServicio: 4,
      descripcion: "x".repeat(2000),
      fechaDeseada: null
    })
    post.flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
  })

  it("uses effective customer server pages and retains selected identity across page gaps without another owner read", async () => {
    const s = await setup()
    await s.open()
    s.getPage(customers).flush(page([customer(8), customer(9)], 0, 2, 3))
    s.http.expectOne(types).flush([service])
    await s.settle()
    await s.fill("customerId", "8")
    s.http.expectOne(`${customers}/8/propiedades`).flush([property()])
    await s.settle()
    await s.fill("propertyId", "31")
    await s.fill("serviceTypeId", "4")
    await s.click("Página siguiente", s.dialog())
    s.getPage(customers, 1, 2).flush(page([customer(10)], 1, 2, 3))
    await s.settle()
    expect(s.field("customerId").value).toBe("8")
    expect(s.dialog().textContent).toContain("Cliente 8")
    expect(s.field("propertyId").value).toBe("31")
    s.http.expectNone(() => true)
    await s.submit()
    s.http.expectOne(r => r.method === "POST").flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
  })

  it.each(["clientes", "propiedades", "tipos de servicio"] as const)(
    "blocks expired %s at the exact TTL boundary until explicit revalidation, preserving the draft",
    async stale => {
      const start = Date.now()
      const clock = vi.spyOn(Date, "now").mockReturnValue(start)
      const s = await setup()
      await s.open()
      s.getPage(customers).flush(page([customer(8), customer(9)], 0, 2, 3))
      s.http.expectOne(types).flush([service])
      await s.settle()
      await s.fill("customerId", "8")
      s.http.expectOne(`${customers}/8/propiedades`).flush([property()])
      await s.settle()
      await s.fill("propertyId", "31")
      await s.fill("serviceTypeId", "4")
      await s.fill("description", "Borrador conservado")
      if (stale === "clientes") {
        await s.click("Página siguiente", s.dialog())
        s.getPage(customers, 1, 2).flush(page([customer(10)], 1, 2, 3))
        await s.settle()
      }
      // Refresh only the other resources, so one independently expires.
      clock.mockReturnValue(start + 60000)
      for (const fresh of ["clientes", "propiedades", "tipos de servicio"] as const) {
        if (fresh === stale) continue
        await s.click(`Actualizar ${fresh}`, s.dialog())
        if (fresh === "clientes")
          s.getPage(customers, 0, 2).flush(page([customer(8), customer(9)], 0, 2, 3))
        else if (fresh === "propiedades")
          s.http.expectOne(`${customers}/8/propiedades`).flush([property()])
        else s.http.expectOne(types).flush([service])
        await s.settle()
      }
      clock.mockReturnValue(start + 120000)
      await s.submit()
      s.http.expectNone(() => true)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.field("customerId").value).toBe("8")
      expect(s.field("propertyId").value).toBe("31")
      expect(s.field("serviceTypeId").value).toBe("4")
      expect(s.field("description").value).toBe("Borrador conservado")
      expect(s.dialog().textContent).toMatch(/Actualiza|verificad/)
      expect(s.harness.routeNativeElement!.textContent).toContain("1–1 de 1")
      if (stale === "clientes") {
        // Revisit using effective size 2, not the original request's size 20.
        await s.click("Página anterior", s.dialog())
        s.getPage(customers, 0, 2).flush(page([customer(8), customer(9)], 0, 2, 3))
      } else {
        await s.click(`Actualizar ${stale}`, s.dialog())
        if (stale === "propiedades")
          s.http.expectOne(`${customers}/8/propiedades`).flush([property()])
        else s.http.expectOne(types).flush([service])
      }
      await s.settle()
      s.http.expectNone(() => true)
      await s.submit()
      const post = s.http.expectOne(r => r.method === "POST")
      expect(post.request.body).toEqual({
        idCliente: 8,
        idPropiedad: 31,
        idTipoServicio: 4,
        descripcion: "Borrador conservado",
        fechaDeseada: null
      })
      post.flush({}, { status: 403, statusText: "Forbidden" })
      await s.settle()
      expect(s.success).not.toHaveBeenCalled()
      s.http.expectNone(() => true)
    }
  )

  it("blocks an invalidated selected customer from an unobserved page until a verified effective-page revisit", async () => {
    const s = await setup()
    await s.open()
    s.getPage(customers).flush(page([customer(8), customer(9)], 0, 2, 3))
    s.http.expectOne(types).flush([service])
    await s.settle()
    await s.fill("customerId", "8")
    s.http.expectOne(`${customers}/8/propiedades`).flush([property()])
    await s.settle()
    await s.fill("propertyId", "31")
    await s.fill("serviceTypeId", "4")
    await s.fill("description", "Sin perder el borrador")
    await s.click("Página siguiente", s.dialog())
    s.getPage(customers, 1, 2).flush(page([customer(10)], 1, 2, 3))
    await s.settle()
    TestBed.inject(CustomersStore).invalidateCustomers(8)
    s.getPage(customers, 1, 2).flush(page([customer(10)], 1, 2, 3))
    await s.settle()
    await s.submit()
    s.http.expectNone(() => true)
    expect(s.success).not.toHaveBeenCalled()
    expect(s.field("customerId").value).toBe("8")
    expect(s.field("propertyId").value).toBe("31")
    expect(s.field("description").value).toBe("Sin perder el borrador")
    expect(s.harness.routeNativeElement!.textContent).toContain("1–1 de 1")
    await s.click("Página anterior", s.dialog())
    s.getPage(customers, 0, 2).flush(page([customer(8), customer(9)], 0, 2, 3))
    await s.settle()
    s.http.expectNone(() => true)
    await s.submit()
    s.http.expectOne(r => r.method === "POST").flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
  })

  it("synchronously resets and cancels the old owner property read when customer changes; foreign/inactive properties cannot be dispatched", async () => {
    const s = await setup()
    await s.open()
    s.getPage(customers).flush(page([customer(8), customer(9)]))
    s.http.expectOne(types).flush([service])
    await s.settle()
    await s.fill("customerId", "8")
    const old = s.http.expectOne(`${customers}/8/propiedades`)
    await s.fill("customerId", "9")
    expect(old.cancelled).toBe(true)
    expect(s.field("propertyId").value).toBe("")
    s.http.expectOne(`${customers}/9/propiedades`).flush([property(31, 8)])
    await s.settle()
    expect(s.dialog().textContent).not.toContain("Dirección 31")
    expect(s.dialog().textContent).toMatch(/No se pudieron cargar las propiedades/)
    await s.click("Reintentar propiedades", s.dialog())
    s.http.expectOne(`${customers}/9/propiedades`).flush([property(32, 9, false)])
    await s.settle()
    expect(s.dialog().textContent).toMatch(/No hay propiedades activas/)
    await s.submit()
    s.http.expectNone(r => r.method === "POST")
  })

  it("keeps independent read errors/verified emptiness and drafts, retrying only the failed catalog", async () => {
    const s = await setup()
    await s.open()
    await s.fill("description", "Borrador conservado")
    s.getPage(customers).flush(
      { mensaje: "RAW INTERNAL" },
      { status: 403, statusText: "Forbidden" }
    )
    s.http.expectOne(types).flush([])
    await s.settle()
    expect(s.dialog().textContent).toMatch(/No se pudieron cargar los clientes/)
    expect(s.dialog().textContent).not.toMatch(/No hay clientes|RAW INTERNAL/)
    expect(s.dialog().textContent).toMatch(/No hay tipos de servicio/)
    await s.click("Reintentar clientes", s.dialog())
    s.getPage(customers).flush(page([customer()]))
    await s.settle()
    expect(s.field("description").value).toBe("Borrador conservado")
    s.http.expectNone(() => true)
  })

  it("blocks stale failed type membership and preserves the draft/selected ID until an explicit successful retry", async () => {
    const s = await setup()
    await s.open()
    await s.choices()
    await s.fill("description", "Conservar")
    await s.click("Actualizar tipos de servicio", s.dialog())
    const refresh = s.http.expectOne(types)
    await s.submit()
    s.http.expectNone(r => r.method === "POST")
    refresh.error(new ProgressEvent("error"))
    await s.settle()
    expect(s.field("serviceTypeId").value).toBe("4")
    await s.submit()
    s.http.expectNone(r => r.method === "POST")
    await s.click("Reintentar tipos de servicio", s.dialog())
    s.http.expectOne(types).flush([])
    await s.settle()
    expect(s.field("serviceTypeId").value).toBe("4")
    expect(s.dialog().textContent).toMatch(/no disponible/i)
    expect(s.field("description").value).toBe("Conservar")
    await s.submit()
    s.http.expectNone(r => r.method === "POST")
  })

  it("retains safe write errors for explicit retry, but a failed post-success GET never replays the POST", async () => {
    const s = await setup()
    await s.open()
    await s.choices()
    await s.fill("description", "Borrador")
    await s.submit()
    s.http
      .expectOne(r => r.method === "POST")
      .flush({ mensaje: "RAW INTERNAL" }, { status: 409, statusText: "Conflict" })
    await s.settle()
    expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
    expect(s.dialog().textContent).not.toContain("RAW INTERNAL")
    expect(s.field("description").value).toBe("Borrador")
    expect(s.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
    await s.submit()
    s.http.expectOne(r => r.method === "POST").flush(dto(18))
    await s.settle()
    s.getPage(requests).error(new ProgressEvent("error"))
    await s.settle()
    expect(s.success).toHaveBeenCalledTimes(1)
    expect(s.harness.routeNativeElement!.textContent).toMatch(/desactualizados/)
    await s.click("Reintentar")
    s.getPage(requests).flush(page([dto(18)], 0, 5))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it.each(["escape", "outside", "cancel"] as const)(
    "allows idle %s dismissal and cancels only dialog-owned reads",
    async action => {
      const s = await setup()
      await s.open()
      const customerRead = s.getPage(customers),
        typeRead = s.http.expectOne(types)
      const editor = s.dialog()
      if (action === "cancel") await s.click("Cancelar", editor)
      else if (action === "escape")
        (s.overlay().keydownEvents() as Subject<KeyboardEvent>).next(
          new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
        )
      else (s.overlay().outsidePointerEvents() as Subject<MouseEvent>).next(new MouseEvent("click"))
      await s.settle()
      expect(customerRead.cancelled).toBe(true)
      expect(typeRead.cancelled).toBe(true)
      expect(TestBed.inject(ServiceRequestsStore).selectRequests().result?.total).toBe(1)
      expect(s.success).not.toHaveBeenCalled()
      s.http.expectNone(() => true)
    }
  )

  it.each(["replacement", "logout", "destroy", "navigate"] as const)(
    "cancels/fences pending creation on %s while same-session renewal preserves it",
    async action => {
      const s = await setup()
      await s.open()
      await s.choices()
      await s.submit()
      const pending = s.http.expectOne(r => r.method === "POST")
      s.session.next(caller(19, "Renewed"))
      await s.settle()
      expect(pending.cancelled).toBe(false)
      if (action === "replacement") s.session.next(caller(20))
      else if (action === "logout") s.session.next(null)
      else if (action === "navigate") await TestBed.inject(Router).navigateByUrl("/away")
      else s.harness.fixture.destroy()
      if (action !== "destroy") await s.settle()
      expect(pending.cancelled).toBe(true)
      expect(s.success).not.toHaveBeenCalled()
      if (action === "replacement") {
        // The still-mounted page may admit a replacement-session list read.
        s.getPage(requests).flush(page([]))
        await s.settle()
      }
      s.http.expectNone(() => true)
    }
  )

  it("fences post-await feedback if logout happens immediately after validated Result delivery", async () => {
    const s = await setup()
    await s.open()
    await s.choices()
    await s.submit()
    s.http.expectOne(r => r.method === "POST").flush(dto(18))
    // No await: session invalidation wins before the async save continuation.
    s.session.next(null)
    await s.settle()
    expect(s.success).not.toHaveBeenCalled()
    // A store-owned synchronous invalidation refresh may already have started;
    // it must be cancelled by the session change, never replay the write.
    const refreshes = s.http.match(r => r.url === requests && r.method === "GET")
    refreshes.forEach(read => expect(read.cancelled).toBe(true))
    s.http.expectNone(r => r.method === "POST")
  })

  it("blocks a detached closing-animation form submission even when its cached choices are valid", async () => {
    const s = await setup()
    await s.open()
    await s.choices()
    const editor = s.dialog(),
      overlay = s.overlay()
    ;(overlay.keydownEvents() as Subject<KeyboardEvent>).next(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    )
    editor
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await s.settle()
    s.http.expectNone(r => r.method === "POST")
    expect(s.success).not.toHaveBeenCalled()
    expect(overlay.hasAttached()).toBe(false)
  })

  it.each([{ server: true }, { guest: true }])(
    "never opens an editor or dispatches catalogs/writes for SSR/guest %j",
    async options => {
      const s = await setup(options)
      const launcher = [
        ...s.harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>("button")
      ].find(b => b.textContent?.trim() === "Crear solicitud")
      launcher?.click()
      await s.settle()
      expect(document.querySelector("app-service-request-editor")).toBeNull()
      s.http.expectNone(() => true)
      expect(s.success).not.toHaveBeenCalled()
    }
  )
})
