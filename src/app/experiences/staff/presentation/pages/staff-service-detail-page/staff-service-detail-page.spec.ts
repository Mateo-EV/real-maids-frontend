import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { getDebugNode, PLATFORM_ID, signal } from "@angular/core"
import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
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

/** The supplied detail with one other state, to render the actions the server supplies. */
function detailInState(status: string, statusName: string) {
  const base = detail()
  return { ...base, orden: { ...base.orden, estado: status, estadoNombre: statusName } }
}

type DetailHarness = Awaited<ReturnType<typeof setup>>

/**
 * WP11 T4/S1–S2 — the assigned staff member's own execution moves on the detail page.
 *
 * Only the two documented moves of an assigned collaborator exist, each one offered by the state
 * the server supplied: `PROGRAMADA` → `EN_PROCESO` and `EN_PROCESO` → `COMPLETADA`. The client never
 * decides whether a transition is legal and never invents a permission: the desired code travels to
 * `PATCH /api/ordenes/{id}/estado` and every refusal comes back from the server.
 */
describe("StaffServiceDetailPage status actions", () => {
  const statusPatch = (s: DetailHarness, id = 17) =>
    s.http.expectOne({ url: `${api}/${id}/estado`, method: "PATCH" })
  const dialogHost = () => document.querySelector<HTMLElement>("app-staff-service-status-dialog")
  const dialogText = () => dialogHost()?.textContent ?? ""
  const dialogButton = (label: string) =>
    Array.from(dialogHost()?.querySelectorAll<HTMLButtonElement>("button") ?? []).find(
      item => item.textContent?.trim() === label
    )
  const settleDialog = async (s: DetailHarness) => {
    // The overlay lives outside the routed fixture, so its own tick is awaited explicitly.
    await new Promise(resolve => setTimeout(resolve))
    await s.settle()
  }
  const openDialog = async (s: DetailHarness, label: string) => {
    await s.click(s.button(label), label)
    await settleDialog(s)
  }
  const fillObservation = async (s: DetailHarness, value: string) => {
    const field = dialogHost()!.querySelector<HTMLTextAreaElement>("#staff-status-observation")!
    field.value = value
    field.dispatchEvent(new Event("input"))
    await settleDialog(s)
  }
  const submitDialog = async (s: DetailHarness) => {
    const confirm = dialogHost()!.querySelector<HTMLButtonElement>("button[type=submit]")
    expect(confirm).not.toBeNull()
    confirm!.click()
    await settleDialog(s)
  }
  const loaded = async (status = "PROGRAMADA", statusName = "Programada") => {
    const s = await setup()
    s.detailRequest().flush(detailInState(status, statusName))
    await s.settle()
    return s
  }

  it.each([
    ["PROGRAMADA", "Programada", "Iniciar servicio", "Completar servicio"],
    ["EN_PROCESO", "En proceso", "Completar servicio", "Iniciar servicio"],
    ["PENDIENTE", "Pendiente", undefined, "Iniciar servicio"],
    ["COMPLETADA", "Completada", undefined, "Iniciar servicio"],
    ["PAGADO", "Pagado", undefined, "Iniciar servicio"],
    ["CANCELADA", "Cancelada", undefined, "Iniciar servicio"],
    // A code this page does not move (unknown to the two documented moves) offers no action at all.
    ["SUSPENDIDA", "Suspendida", undefined, "Iniciar servicio"]
  ])(
    "offers only the execution move of the supplied %s state",
    async (status, statusName, offered, absent) => {
      const s = await loaded(status, statusName)
      expect(s.element().textContent).toContain(statusName)
      if (offered) expect(s.button(offered)).toBeDefined()
      else {
        expect(s.button("Iniciar servicio")).toBeUndefined()
        expect(s.button("Completar servicio")).toBeUndefined()
      }
      // Never the other move, and never a free status picker or an invented transition.
      expect(s.button(absent)).toBeUndefined()
      expect(s.element().querySelectorAll("select").length).toBe(0)
      expect(s.element().textContent).not.toMatch(/Cambiar estado|Marcar pagad|Cancelar servicio/)
      s.http.expectNone(() => true)
    }
  )

  it("confirms the named service and the current→desired state, then refreshes it exactly once", async () => {
    const s = await loaded()
    await openDialog(s, "Iniciar servicio")
    const text = dialogText()
    expect(text).toContain("OS-2026-000017")
    expect(text).toContain("Casa centro")
    expect(text).toContain("Programada")
    expect(text).toContain("En proceso")
    // The confirmation never carries operational access data, on any audience.
    expect(text).not.toContain(accessInstructions)
    expect(text).not.toContain(doorCode)
    expect(text).not.toContain(staffPhone)
    // Nothing is written before the explicit confirmation.
    s.http.expectNone(r => r.method === "PATCH")

    await fillObservation(s, "  Llegué al domicilio  ")
    await submitDialog(s)
    const patch = statusPatch(s)
    expect(patch.request.body).toEqual({
      estado: "EN_PROCESO",
      observacion: "Llegué al domicilio"
    })
    expect(patch.request.transferCache).toBe(false)
    // No optimistic state and no feedback before the server confirms.
    expect(s.element().textContent).toContain("Programada")
    expect(s.element().querySelector("[data-detail-confirmation]")).toBeNull()

    patch.flush(detailInState("EN_PROCESO", "En proceso"))
    await settleDialog(s)
    // One confirmation and exactly one fresh read of that order.
    expect(s.element().querySelector("[data-detail-confirmation]")?.textContent).toContain(
      "Servicio iniciado"
    )
    s.detailRequest().flush(detailInState("EN_PROCESO", "En proceso"))
    await s.settle()
    expect(s.element().textContent).toContain("En proceso")
    expect(dialogHost()).toBeNull()
    // The refreshed state now offers only the next documented move.
    expect(s.button("Completar servicio")).toBeDefined()
    expect(s.button("Iniciar servicio")).toBeUndefined()
    s.http.expectNone(() => true)
  })

  it("blocks a second submit while the first one is pending", async () => {
    const s = await loaded()
    await openDialog(s, "Iniciar servicio")
    await submitDialog(s)
    const first = statusPatch(s)
    // Pending: the dialog is still open and a repeated click cannot dispatch again.
    const pendingSubmit = dialogHost()!.querySelector<HTMLButtonElement>("button[type=submit]")!
    expect(pendingSubmit.disabled).toBe(true)
    // Pending state also owns the dismissal guard: Cancel cannot abandon a dispatched write.
    expect(dialogButton("Cancelar")!.disabled).toBe(true)
    await submitDialog(s)
    s.http.expectNone(() => true)
    expect(dialogHost()).not.toBeNull()
    first.flush(detailInState("EN_PROCESO", "En proceso"))
    await settleDialog(s)
    s.http.expectNone(r => r.method === "PATCH")
    // The single confirmed change leaves the dialog and forces exactly one fresh read.
    expect(dialogHost()).toBeNull()
    s.detailRequest().flush(detailInState("EN_PROCESO", "En proceso"))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("never dispatches an observation over 250 characters", async () => {
    const s = await loaded()
    await openDialog(s, "Iniciar servicio")
    await fillObservation(s, "a".repeat(251))
    await submitDialog(s)
    s.http.expectNone(r => r.method === "PATCH")
    expect(dialogHost()).not.toBeNull()
    expect(dialogText()).toMatch(/250/)
    // The same dialog still works with a bounded observation.
    await fillObservation(s, "a".repeat(250))
    await submitDialog(s)
    expect(statusPatch(s).request.body.estado).toBe("EN_PROCESO")
  })

  it("keeps the dialog and the record usable when the server refuses the change", async () => {
    const s = await loaded()
    await openDialog(s, "Iniciar servicio")
    await submitDialog(s)
    statusPatch(s).flush(
      { mensaje: "RAW BACKEND RULE TEXT" },
      { status: 400, statusText: "Bad Request" }
    )
    await settleDialog(s)
    const text = dialogText()
    expect(text).toMatch(/no se confirmó/i)
    // Safe copy only, never the raw backend text.
    expect(text).not.toContain("RAW BACKEND RULE TEXT")
    expect(dialogHost()).not.toBeNull()
    // No read was forced by the refusal and the verified record is untouched.
    s.http.expectNone(() => true)
    expect(s.element().textContent).toContain("OS-2026-000017")
    expect(s.element().querySelector("[data-detail-confirmation]")).toBeNull()
    // The failure stays actionable: the same confirmation can be retried explicitly.
    await submitDialog(s)
    expect(statusPatch(s).request.body.estado).toBe("EN_PROCESO")
  })

  it.each([
    [403, "Forbidden", /permiso/i],
    [409, "Conflict", /conflicto/i]
  ] as const)(
    "keeps the dialog and the record usable without a read or a resend on HTTP %i",
    async (status, statusText, copy) => {
      const s = await loaded()
      await openDialog(s, "Iniciar servicio")
      await submitDialog(s)
      statusPatch(s).flush({ mensaje: "RAW BACKEND TEXT" }, { status, statusText })
      await settleDialog(s)
      expect(dialogHost()).not.toBeNull()
      expect(dialogText()).toMatch(copy)
      expect(dialogText()).not.toContain("RAW BACKEND TEXT")
      // The supplied record is untouched and no read was forced by the refusal.
      expect(s.element().textContent).toContain("OS-2026-000017")
      expect(s.element().textContent).toContain("Programada")
      expect(s.element().querySelector("[data-detail-refusal]")).toBeNull()
      s.http.expectNone(() => true)
    }
  )

  it("keeps the dialog and the record usable after a network failure", async () => {
    const s = await loaded()
    await openDialog(s, "Iniciar servicio")
    await submitDialog(s)
    statusPatch(s).error(new ProgressEvent("error"))
    await settleDialog(s)
    expect(dialogHost()).not.toBeNull()
    expect(dialogText()).toMatch(/no se pudo confirmar/i)
    expect(s.element().textContent).toContain("OS-2026-000017")
    expect(s.element().querySelector("[data-detail-refusal]")).toBeNull()
    // No automatic resend and no automatic read after an unknown outcome.
    s.http.expectNone(() => true)
  })

  it("refuses Escape and outside dismissal while the write is pending", async () => {
    const s = await loaded()
    await openDialog(s, "Iniciar servicio")
    await submitDialog(s)
    const patch = statusPatch(s)
    const cdk = getDebugNode(dialogHost()!)!.injector.get(CdkDialogRef)
    dialogHost()!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    cdk.overlayRef.backdropElement!.click()
    document.body.click()
    await settleDialog(s)
    expect(dialogHost()).not.toBeNull()
    // The dispatched write is still the only one.
    patch.flush(detailInState("EN_PROCESO", "En proceso"))
    await settleDialog(s)
    s.http.expectNone(r => r.method === "PATCH")
    s.detailRequest().flush(detailInState("EN_PROCESO", "En proceso"))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("does not open a second confirmation while one is already open", async () => {
    const s = await loaded()
    await openDialog(s, "Iniciar servicio")
    await s.click(s.button("Iniciar servicio"), "Iniciar servicio")
    expect(document.querySelectorAll("app-staff-service-status-dialog").length).toBe(1)
    await submitDialog(s)
    statusPatch(s)
    await s.click(s.button("Iniciar servicio"), "Iniciar servicio")
    expect(document.querySelectorAll("app-staff-service-status-dialog").length).toBe(1)
    // Neither the second page action nor a repeated confirmation dispatched another write.
    s.http.expectNone(r => r.method === "PATCH")
  })

  it("sends a blank observation as null and the same payload shape for the completed move", async () => {
    const s = await loaded()
    await openDialog(s, "Iniciar servicio")
    await fillObservation(s, "   ")
    await submitDialog(s)
    const start = statusPatch(s)
    expect(start.request.body).toEqual({ estado: "EN_PROCESO", observacion: null })
    start.flush(detailInState("EN_PROCESO", "En proceso"))
    await settleDialog(s)
    s.detailRequest().flush(detailInState("EN_PROCESO", "En proceso"))
    await s.settle()

    await openDialog(s, "Completar servicio")
    await submitDialog(s)
    const complete = statusPatch(s)
    // The desired code travels untouched and the payload shape is identical.
    expect(complete.request.body).toEqual({ estado: "COMPLETADA", observacion: null })
    complete.flush(detailInState("COMPLETADA", "Completada"))
    await settleDialog(s)
    s.detailRequest().flush(detailInState("COMPLETADA", "Completada"))
    await s.settle()
    expect(s.element().textContent).toContain("Completada")
    // A completed service offers neither documented move any more.
    expect(s.button("Iniciar servicio")).toBeUndefined()
    expect(s.button("Completar servicio")).toBeUndefined()
    s.http.expectNone(() => true)
  })

  it("treats a write 404 as a refusal: record kept, safe notice, one forced read, no resend", async () => {
    const s = await loaded()
    await openDialog(s, "Iniciar servicio")
    await submitDialog(s)
    statusPatch(s).flush(
      { mensaje: "RAW INTERNAL DETAIL" },
      { status: 404, statusText: "Not Found" }
    )
    await settleDialog(s)
    // The record was just displayed: a 404 on the write never proves absence.
    expect(dialogHost()).toBeNull()
    expect(s.element().querySelector("[data-detail-unavailable]")).toBeNull()
    const text = s.element().textContent!
    expect(text).toContain("OS-2026-000017")
    expect(text).toMatch(/no está disponible para tu usuario/i)
    expect(text).not.toMatch(/no cambiará el resultado/i)
    expect(text).not.toContain("RAW INTERNAL DETAIL")
    // The GET is the authority on visibility: exactly one forced read, never a resent write.
    s.detailRequest().flush(detailInState("EN_PROCESO", "En proceso"))
    await s.settle()
    expect(s.element().textContent).toContain("En proceso")
    expect(s.element().querySelector("[data-detail-refusal]")).toBeNull()
    expect(s.button("Completar servicio")).toBeDefined()
    s.http.expectNone(r => r.method === "PATCH")
    s.http.expectNone(() => true)
  })

  it("renders the definitive absence only when the forced read itself answers 404", async () => {
    const s = await loaded()
    await openDialog(s, "Iniciar servicio")
    await submitDialog(s)
    statusPatch(s).flush({}, { status: 404, statusText: "Not Found" })
    await settleDialog(s)
    expect(s.element().querySelector("[data-detail-unavailable]")).toBeNull()

    s.detailRequest().flush(
      { mensaje: "RAW INTERNAL DETAIL" },
      { status: 404, statusText: "Not Found" }
    )
    await s.settle()
    const text = s.element().textContent!
    expect(s.element().querySelector("[data-detail-unavailable]")).not.toBeNull()
    // Now the read established the absence, so the copy and the missing retry hold.
    expect(text).toMatch(/no cambiará el resultado/i)
    expect(text).not.toContain("RAW INTERNAL DETAIL")
    expect(s.button("Reintentar")).toBeUndefined()
    expect(s.button("Iniciar servicio")).toBeUndefined()
    s.http.expectNone(r => r.method === "PATCH")
    s.http.expectNone(() => true)
  })

  it("keeps the record and asks for a refresh when the forced read itself fails transiently", async () => {
    const s = await loaded()
    await openDialog(s, "Iniciar servicio")
    await submitDialog(s)
    statusPatch(s).flush({}, { status: 404, statusText: "Not Found" })
    await settleDialog(s)
    s.detailRequest().flush(
      { mensaje: "RAW INTERNAL DETAIL" },
      { status: 500, statusText: "Server Error" }
    )
    await s.settle()
    // A transient read never turns a write refusal into a definitive absence.
    expect(s.element().querySelector("[data-detail-unavailable]")).toBeNull()
    expect(s.element().querySelector("[data-detail-refusal]")).not.toBeNull()
    expect(s.element().textContent).toContain("OS-2026-000017")
    expect(s.element().textContent).not.toMatch(/no cambiará el resultado/i)
    expect(s.button("Reintentar")).toBeDefined()
    s.http.expectNone(r => r.method === "PATCH")
  })

  it("delivers no late feedback and reads nothing for the old order after a route change", async () => {
    const s = await loaded()
    await openDialog(s, "Iniciar servicio")
    await submitDialog(s)
    const patch = statusPatch(s)
    await s.navigate("/staff/services/18")
    // The abandoned confirmation cannot complete against the new route identity.
    expect(patch.cancelled).toBe(true)
    s.detailRequest(18).flush(detail(18))
    await s.settle()
    expect(s.element().textContent).toContain("OS-2026-000018")
    expect(s.element().querySelector("[data-detail-confirmation]")).toBeNull()
    expect(s.element().querySelector("[data-detail-refusal]")).toBeNull()
    // No forced read of the abandoned order and no write of any kind.
    s.http.expectNone(candidate => candidate.url === `${api}/17`)
    s.http.expectNone(r => r.method === "PATCH")
  })
})
