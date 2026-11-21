import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { EMPTY } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideOperationsRequestReads } from "@/app/features/operations/operations.providers"
import { StaffServicesPage } from "../staff-services-page/staff-services-page"
import { StaffServiceDetailPage } from "./staff-service-detail-page"

const api = "http://localhost:8080/api/ordenes"
const stamp = "2026-03-02T04:30:00-05:00"
/** Sentinels: the assigned service detail never prints these, on any audience. */
const doorCode = "PUERTA-SECRETA-1234"
const accessInstructions = "INSTRUCCIONES-ACCESO-PRIVADAS"
const staffPhone = "+56 9 1111 2222"

/** The backend label of the field staff seed role; the detail never sends its staff id. */
const fieldStaff = () =>
  AuthSession.create(
    "Personal Campo",
    "campo@example.test",
    "PERSONAL_CAMPO",
    null,
    11,
    3,
    "es",
    []
  )

function order(id = 17) {
  return {
    idOrden: id,
    codigo: `OS-2026-${String(id).padStart(6, "0")}`,
    estado: "PROGRAMADA",
    estadoNombre: "Programada",
    idSolicitud: 42,
    idCliente: 88,
    cliente: "Cliente Asignado",
    idPropiedad: 31,
    propiedad: "Casa centro",
    idTipoServicio: 4,
    tipoServicio: "Limpieza profunda",
    duracionEstimadaMinutos: 90,
    montoEstimado: 120.5,
    observacion: "Dejar la llave con el conserje",
    programacion: {
      idProgramacion: 51,
      fecha: "2026-03-12",
      horaInicio: "08:30:00",
      horaFin: "11:00:00",
      vigente: true,
      motivo: null,
      registradoPor: "Operador Propio",
      fechaRegistro: stamp
    },
    asignados: [
      { idPersonal: 21, nombre: "Personal 21", telefono: staffPhone, rol: "RESPONSABLE" }
    ],
    fechaCreacion: stamp,
    fechaActualizacion: null
  }
}

/** `GET /api/ordenes/{id}` answers the same detail shape the operations module decodes. */
function detail(id = 17) {
  const target = order(id)
  return {
    orden: target,
    propiedad: {
      idPropiedad: target.idPropiedad,
      idCliente: target.idCliente,
      alias: "Casa centro",
      direccion: "Av. Siempre Viva 742",
      ciudad: "Santiago",
      estadoRegion: "Metropolitana",
      codigoPostal: "8320000",
      areaM2: 120.5,
      numeroAmbientes: 4,
      numeroBanos: 2,
      instruccionesAcceso: accessInstructions,
      codigoPuerta: doorCode,
      tieneMascotas: true,
      activo: true,
      fechaCreacion: stamp
    },
    historial: [
      {
        estado: "PROGRAMADA",
        estadoNombre: "Programada",
        usuario: null,
        observacion: null,
        fecha: stamp
      }
    ],
    programaciones: target.programacion === null ? [] : [target.programacion]
  }
}

function listPage(pagina: number, tamanio: number, total: number, first = order()) {
  const count = Math.min(tamanio, Math.max(0, total - pagina * tamanio))
  return {
    contenido: Array.from({ length: count }, (_, index) =>
      index === 0 ? first : order(1000 + index)
    ),
    pagina,
    tamanio,
    totalElementos: total,
    totalPaginas: Math.ceil(total / tamanio)
  }
}

async function setup(url = "/staff/services/17", options: { server?: boolean } = {}) {
  TestBed.resetTestingModule()
  const session = signal(fieldStaff())
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideOperationsRequestReads(),
      provideRouter([
        { path: "staff/services", component: StaffServicesPage },
        { path: "staff/services/:id", component: StaffServiceDetailPage }
      ]),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: AuthStore, useValue: { session } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
      { provide: PLATFORM_ID, useValue: options.server ? "server" : "browser" }
    ]
  })
  const harness = await RouterTestingHarness.create(url)
  const router = TestBed.inject(Router)
  const http = TestBed.inject(HttpTestingController)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  const element = () => harness.routeNativeElement as HTMLElement
  const navigate = async (target: string) => {
    await router.navigateByUrl(target)
    await settle()
  }
  /** The detail read of one assigned service: no staff id, no filter and no caller scope travel. */
  const detailRequest = (id = 17) => {
    const pending = http.expectOne(`${api}/${id}`)
    expect(pending.request.method).toBe("GET")
    expect(pending.request.transferCache).toBe(false)
    // WP11 S4: reachability is caller-relative; this consumer never names a staff member.
    expect(pending.request.params.keys()).toEqual([])
    expect(pending.request.url).not.toMatch(/idPersonal|personal/)
    return pending
  }
  const listRequest = (pagina = 0, tamanio = 20) => {
    const pending = http.expectOne(
      candidate =>
        candidate.url === api &&
        candidate.params.get("pagina") === String(pagina) &&
        candidate.params.get("tamanio") === String(tamanio)
    )
    expect(pending.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    return pending
  }
  const button = (label: string) =>
    Array.from(element().querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
  const link = (label: string) =>
    Array.from(element().querySelectorAll<HTMLAnchorElement>("a")).find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
  const click = async (
    target: HTMLButtonElement | HTMLAnchorElement | undefined,
    label: string
  ) => {
    expect(target, label).toBeDefined()
    target!.click()
    await settle()
  }
  await settle()
  return {
    harness,
    router,
    http,
    settle,
    element,
    navigate,
    detailRequest,
    listRequest,
    button,
    link,
    click
  }
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    vi.restoreAllMocks()
  }
})

// WP11 T3/S4–S5: one assigned service, read through the root store, printed literally.
describe("StaffServiceDetailPage", () => {
  it("renders the assigned service the server supplied, without a staff id or sensitive fields", async () => {
    const s = await setup()
    expect(s.element().querySelector('[role="status"]')?.textContent).toMatch(/Cargando servicio/)
    s.detailRequest().flush(detail())
    await s.settle()

    const text = s.element().textContent!
    expect(text).not.toMatch(/Cargando servicio/)
    expect(text).toContain("OS-2026-000017")
    expect(text).toContain("Programada")
    expect(text).toContain("Cliente Asignado")
    expect(text).toContain("Casa centro")
    expect(text).toContain("Limpieza profunda")
    // Supplied calendar/clock text is verbatim: no timezone shift, no derived range.
    expect(text).toContain("2026-03-12")
    expect(text).toContain("08:30:00")
    expect(text).toContain("11:00:00")
    // Amounts and observations are printed exactly as supplied, never recomputed.
    expect(text).toContain("120.50")
    expect(text).toContain("Dejar la llave con el conserje")
    // Assigned staff appear by name and role only.
    expect(text).toContain("Personal 21")
    expect(text).toContain("RESPONSABLE")
    expect(text).not.toContain(staffPhone)
    // WP11 T3: access instructions and door codes are never part of this page at all.
    expect(text).not.toContain(accessInstructions)
    expect(text).not.toContain(doorCode)
    expect(s.element().innerHTML).not.toMatch(/instruccionesAcceso|codigoPuerta/)
    s.http.expectNone(() => true)
  })

  it("treats a 404 outside the caller's scope as definitive absence with no retry affordance", async () => {
    const s = await setup()
    s.detailRequest().flush(
      { mensaje: "RAW INTERNAL DETAIL" },
      { status: 404, statusText: "Not Found" }
    )
    await s.settle()

    const text = s.element().textContent!
    expect(text).toMatch(/no está disponible/i)
    // Repeating the same GET cannot change the answer, so the copy says so and no retry exists.
    expect(text).toMatch(/volver a consultarlo no cambiará el resultado/i)
    expect(text).not.toContain("RAW INTERNAL DETAIL")
    expect(s.button("Reintentar")).toBeUndefined()
    expect(s.element().querySelector("[data-detail-unavailable]")).not.toBeNull()
    s.http.expectNone(() => true)
  })

  it("keeps a retryable alert for a transient failure and refetches only on request", async () => {
    const s = await setup()
    s.detailRequest().flush(
      { mensaje: "RAW INTERNAL DETAIL" },
      { status: 500, statusText: "Server Error" }
    )
    await s.settle()

    const alert = s.element().querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert!.textContent).not.toMatch(/no cambiará el resultado/i)
    expect(s.element().textContent).not.toContain("RAW INTERNAL DETAIL")
    // No automatic retry and no polling: exactly one read so far.
    s.http.expectNone(() => true)

    await s.click(s.button("Reintentar"), "Reintentar")
    s.detailRequest().flush(detail())
    await s.settle()
    expect(s.element().querySelector('[role="alert"]')).toBeNull()
    expect(s.element().textContent).toContain("OS-2026-000017")
    s.http.expectNone(() => true)
  })

  it("dispatches nothing for an invalid route id", async () => {
    for (const id of ["abc", "0", "1.5", "2147483648"]) {
      const s = await setup(`/staff/services/${id}`)
      expect(s.element().textContent).toMatch(/no corresponde a un servicio válido/i)
      expect(s.element().querySelector('[role="status"]')).toBeNull()
      expect(s.button("Reintentar")).toBeUndefined()
      s.http.expectNone(() => true)
    }
  })

  it("does not restart the same-id read when only the return context changes", async () => {
    const s = await setup()
    s.detailRequest().flush(detail())
    await s.settle()

    await s.navigate("/staff/services/17?page=1&size=10")
    // Query-only change: the read is not restarted and the verified record is kept.
    s.http.expectNone(() => true)
    expect(s.element().textContent).toContain("OS-2026-000017")
    expect(s.link("Volver a mis servicios")?.getAttribute("href")).toBe(
      "/staff/services?page=1&size=10"
    )
  })

  it("replaces the read when the route id changes", async () => {
    const s = await setup()
    s.detailRequest().flush(detail())
    await s.settle()

    await s.navigate("/staff/services/18")
    const next = s.detailRequest(18)
    // The previous record is never shown under the new route identity.
    expect(s.element().textContent).not.toContain("OS-2026-000017")
    expect(s.element().textContent).toMatch(/Cargando servicio/)
    next.flush(detail(18))
    await s.settle()
    expect(s.element().textContent).toContain("OS-2026-000018")
    s.http.expectNone(() => true)
  })

  it("lands the row link, the detail and its return link on the same effective page", async () => {
    const s = await setup("/staff/services?page=2&size=5")
    // Entry context comes from the URL pair; the server answers the effective 5 per page.
    s.listRequest(2, 5).flush(listPage(2, 5, 12))
    await s.settle()
    expect(s.element().textContent).toContain("11–12 de 12")

    const row = s.link("OS-2026-000017")
    expect(row?.getAttribute("href")).toBe("/staff/services/17?page=2&size=5")
    await s.click(row, "OS-2026-000017")
    expect(s.router.url).toBe("/staff/services/17?page=2&size=5")
    s.detailRequest().flush(detail())
    await s.settle()
    expect(s.element().textContent).toContain("OS-2026-000017")

    const back = s.link("Volver a mis servicios")
    expect(back?.getAttribute("href")).toBe("/staff/services?page=2&size=5")
    await s.click(back, "Volver a mis servicios")
    // Same effective page, served from the verified entry: no second read of the list.
    s.http.expectNone(() => true)
    expect(s.element().textContent).toContain("11–12 de 12")
    expect(s.element().textContent).toContain("OS-2026-000017")
  })

  it("falls back to the first page as a whole for a malformed or oversized pair", async () => {
    const s = await setup("/staff/services?page=1&size=101")
    s.listRequest(0, 20).flush(listPage(0, 20, 12))
    await s.settle()
    // Never a silently clamped size.
    expect(s.element().textContent).toContain("1–12 de 12")
    s.http.expectNone(() => true)
  })

  it("dispatches no read on the server platform", async () => {
    const s = await setup("/staff/services/17", { server: true })
    expect(s.element().querySelector("hlm-spinner")).toBeNull()
    expect(s.element().textContent).not.toMatch(/Cargando servicio/)
    s.http.expectNone(() => true)
  })
})
