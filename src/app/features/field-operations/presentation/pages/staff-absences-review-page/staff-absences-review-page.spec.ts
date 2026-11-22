import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { HotToastService } from "@ngxpert/hot-toast"
import { EMPTY } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideFieldOperationsReads } from "../../../field-operations.providers"
import { StaffAbsencesReviewPage } from "./staff-absences-review-page"

const api = "http://localhost:8080/api/ausencias"
const stamp = "2026-04-01T10:00:00Z"
const hr = () =>
  AuthSession.create("Administrativa RRHH", "rrhh@example.test", "ADMINISTRATIVO", null, 5)

function dto(id = 9, estado = "PENDIENTE", others: Record<string, unknown> = {}) {
  return {
    idAusencia: id,
    idPersonal: 21,
    nombrePersonal: `Personal ${21 + id}`,
    fechaInicio: "2026-04-06",
    fechaFin: "2026-04-08",
    dias: 3,
    motivo: `Motivo reservado ${id}`,
    estado,
    observacionResolucion: null,
    fechaRegistro: stamp,
    fechaResolucion: null,
    ...others
  }
}

function page(
  contenido: unknown[] = [dto()],
  pagina = 0,
  tamanio = 20,
  totalElementos = contenido.length
) {
  return {
    contenido,
    pagina,
    tamanio,
    totalElementos,
    totalPaginas: Math.ceil(totalElementos / tamanio)
  }
}

async function setup() {
  TestBed.resetTestingModule()
  const session = signal(hr())
  const toast = { success: vi.fn(), error: vi.fn() }
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideFieldOperationsReads(),
      provideRouter([{ path: "admin/staff/absences", component: StaffAbsencesReviewPage }]),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: AuthStore, useValue: { session } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
      { provide: HotToastService, useValue: toast },
      { provide: PLATFORM_ID, useValue: "browser" }
    ]
  })
  const harness = await RouterTestingHarness.create("/admin/staff/absences")
  const http = TestBed.inject(HttpTestingController)
  const router = TestBed.inject(Router)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement as HTMLElement
  /** The HR queue is a server query: an optional state filter plus shared paging, nothing else. */
  const listRequest = (pagina = 0, tamanio = 20, estado?: string) => {
    const pending = http.expectOne(
      candidate =>
        candidate.url === api &&
        candidate.params.get("pagina") === String(pagina) &&
        candidate.params.get("tamanio") === String(tamanio) &&
        (estado === undefined
          ? candidate.params.get("estado") === null
          : candidate.params.get("estado") === estado)
    )
    expect(pending.request.method).toBe("GET")
    expect(pending.request.transferCache).toBe(false)
    return pending
  }
  const button = (label: string, root: ParentNode = element()) =>
    Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
  const click = async (target: HTMLButtonElement | undefined, label: string) => {
    expect(target, label).toBeDefined()
    expect(target!.disabled, label).toBe(false)
    target!.click()
    await settle()
  }
  const filter = async (value: string) => {
    const select = element().querySelector<HTMLSelectElement>(
      "[data-absence-status-filter] select"
    )!
    select.value = value
    select.dispatchEvent(new Event("change"))
    await settle()
  }
  return { harness, http, router, settle, element, listRequest, button, click, filter, toast }
}

const decisionHost = () => document.querySelector<HTMLElement>("app-staff-absence-decision-dialog")
const decisionButton = (label: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    item => item.textContent?.trim() === label
  )
const settleOverlay = async (s: { settle: () => Promise<void> }) => {
  await new Promise(resolve => setTimeout(resolve))
  await s.settle()
}

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    vi.restoreAllMocks()
  }
})

describe("StaffAbsencesReviewPage", () => {
  it("renders the HR queue with the supplied reason, printed as plain text", async () => {
    const s = await setup()
    expect(s.element().querySelector('[role="status"]')?.textContent).toMatch(/Cargando ausencias/)
    s.listRequest().flush(page([dto(), dto(10, "APROBADA")]))
    await s.settle()

    const text = s.element().textContent!
    expect(text).toContain("Ausencias del personal")
    expect(text).toContain("Personal 30")
    expect(text).toContain("2026-04-06")
    expect(text).toContain("2026-04-08")
    // S7/S9: the reason is visible to HR here and nowhere else — never in the URL.
    expect(text).toContain("Motivo reservado 9")
    expect(text).toContain("Pendiente")
    expect(text).toContain("Aprobada")
    expect(s.router.url).toBe("/admin/staff/absences")
    s.http.expectNone(() => true)
  })

  it("never renders the queue or its reasons again once the server denies the read", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto(), dto(10, "APROBADA")]))
    await s.settle()
    expect(s.element().textContent).toContain("Motivo reservado 9")

    // The denial arrives on the refresh a confirmed decision triggers, with the detail open.
    await s.click(s.button("Ver detalle"), "Ver detalle")
    s.http.expectOne(`${api}/9`).flush(dto(9, "APROBADA"))
    await s.settle()
    await s.click(s.element().querySelector("[data-absence-decision='APROBADA']")!, "Aprobar")
    await s.click(decisionButton("Aprobar ausencia"), "Aprobar ausencia")
    s.http
      .expectOne({ url: `${api}/9/estado`, method: "PATCH" })
      .flush(dto(9, "APROBADA", { fechaResolucion: stamp }))
    await settleOverlay(s)
    // The refreshed detail lands first, so the denial below is strictly about the queue.
    s.http.expectOne(`${api}/9`).flush(dto(9, "APROBADA", { fechaResolucion: stamp }))
    s.listRequest().flush(
      { mensaje: "RAW DENIAL DETAIL" },
      { status: 403, statusText: "Forbidden" }
    )
    await s.settle()

    const denied = s.element().textContent!
    expect(denied).toMatch(/permiso/i)
    expect(denied).not.toContain("Motivo reservado")
    expect(denied).not.toContain("RAW DENIAL DETAIL")
    // Nothing protected survives, and no action can be started from a denied queue.
    expect(s.element().querySelectorAll("[data-absence]").length).toBe(0)
    expect(s.element().querySelectorAll("[data-absence-decision]").length).toBe(0)
    expect(s.element().querySelector("[data-absence-detail]")).toBeNull()

    // A transient failure cannot bring the denied data back.
    await s.click(s.button("Reintentar"), "Reintentar")
    s.listRequest().flush({}, { status: 500, statusText: "Server Error" })
    await s.settle()
    expect(s.element().textContent).not.toContain("Motivo reservado")
    s.http.expectNone(() => true)
  })

  it("keeps the denial latched through a later transient failure and cannot reopen retained detail", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto()]))
    await s.settle()
    // A verified detail is retained in the store before anything is denied.
    await s.click(s.button("Ver detalle"), "Ver detalle")
    s.http
      .expectOne(`${api}/9`)
      .flush(dto(9, "APROBADA", { observacionResolucion: "Servicios reasignados" }))
    await s.settle()
    await s.click(s.button("Cerrar detalle"), "Cerrar detalle")

    // The filtered queue is denied: the page latches the denial.
    await s.filter("APROBADA")
    s.listRequest(0, 20, "APROBADA").flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.element().textContent).toMatch(/permiso/i)

    // Returning to the previously verified query still performs a real server read; the denial
    // latch is not cleared by a cached entry and nothing protected renders meanwhile.
    await s.filter("all")
    expect(s.element().textContent).not.toContain("Motivo reservado 9")
    expect(s.element().querySelectorAll("[data-absence]").length).toBe(0)
    s.listRequest().flush({}, { status: 500, statusText: "Server Error" })
    await s.settle()

    // The reviewer's sequence: a transient failure must not clear the denial latch.
    expect(s.element().textContent).toMatch(/permiso/i)
    expect(s.element().textContent).not.toContain("Motivo reservado 9")
    expect(s.element().querySelectorAll("[data-absence]").length).toBe(0)
    expect(s.element().querySelectorAll("[data-absence-decision]").length).toBe(0)
    await s.click(s.button("Reintentar"), "Reintentar")
    s.listRequest().flush({}, { status: 500, statusText: "Server Error" })
    await s.settle()
    expect(s.element().textContent).toMatch(/permiso/i)
    expect(s.element().textContent).not.toContain("Motivo reservado 9")
    // And the retained detail of that record cannot be opened again while the latch holds.
    expect(s.button("Ver detalle")).toBeUndefined()
    expect(s.element().querySelector("[data-absence-detail]")).toBeNull()
    expect(s.element().textContent).not.toContain("Servicios reasignados")

    // Only an authorized read clears it.
    await s.click(s.button("Reintentar"), "Reintentar")
    s.listRequest().flush(page([dto()]))
    await s.settle()
    expect(s.element().textContent).toContain("Motivo reservado 9")
    expect(s.element().querySelector('[role="alert"]')).toBeNull()
    s.http.expectNone(() => true)
  })

  it("hides one record when its own detail read is denied", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto()]))
    await s.settle()
    await s.click(s.button("Ver detalle"), "Ver detalle")
    s.http.expectOne(`${api}/9`).flush(dto(9, "APROBADA"))
    await s.settle()
    expect(s.element().querySelector("[data-absence-detail]")?.textContent).toContain(
      "Motivo reservado 9"
    )

    // The confirmed decision invalidates the open detail too; that read is denied.
    await s.click(s.element().querySelector("[data-absence-decision='APROBADA']")!, "Aprobar")
    await s.click(decisionButton("Aprobar ausencia"), "Aprobar ausencia")
    s.http
      .expectOne({ url: `${api}/9/estado`, method: "PATCH" })
      .flush(dto(9, "APROBADA", { fechaResolucion: stamp }))
    await settleOverlay(s)
    s.listRequest().flush(page([dto(9, "APROBADA")]))
    s.http.expectOne(`${api}/9`).flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()

    const panel = s.element().querySelector("[data-absence-detail]")
    expect(panel).not.toBeNull()
    expect(panel!.textContent).toMatch(/permiso/i)
    expect(panel!.textContent).not.toContain("Motivo reservado")
    // The queue's own authorized read stays visible.
    expect(s.element().textContent).toContain("Motivo reservado 9")
    s.http.expectNone(() => true)
  })

  it("keeps verified rows on a transient failure and labels them as outdated", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto()]))
    await s.settle()
    await s.click(s.element().querySelector("[data-absence-decision='APROBADA']")!, "Aprobar")
    await s.click(decisionButton("Aprobar ausencia"), "Aprobar ausencia")
    s.http
      .expectOne({ url: `${api}/9/estado`, method: "PATCH" })
      .flush(dto(9, "APROBADA", { fechaResolucion: stamp }))
    await settleOverlay(s)
    s.listRequest().flush({}, { status: 500, statusText: "Server Error" })
    await s.settle()
    expect(s.element().textContent).toContain("Motivo reservado 9")
    expect(s.element().querySelector('[role="alert"]')?.textContent).toMatch(/desactualizados/i)
    s.http.expectNone(() => true)
  })

  it("filters by the closed status set on the server and resets the page", async () => {
    const s = await setup()
    s.listRequest(0, 20).flush(page([dto()], 0, 20, 1))
    await s.settle()
    await s.filter("APROBADA")
    s.listRequest(0, 20, "APROBADA").flush(page([], 0, 20, 0))
    await s.settle()
    expect(s.element().textContent).toMatch(/no hay ausencias/i)
    // A filter never travels in the address bar: it is a server query of the page.
    expect(s.router.url).toBe("/admin/staff/absences")
    s.http.expectNone(() => true)
  })

  it("offers only the moves the supplied state allows", async () => {
    const s = await setup()
    s.listRequest().flush(
      page([
        dto(1, "PENDIENTE"),
        dto(2, "APROBADA"),
        dto(3, "RECHAZADA"),
        dto(4, "CANCELADA"),
        dto(5, "RETIRADA")
      ])
    )
    await s.settle()
    // The desktop table carries the record rows; the mobile list mirrors them.
    const rows = Array.from(
      s.element().querySelectorAll<HTMLElement>("[catalogDesktop] [data-absence]")
    )
    expect(rows.length).toBe(5)
    const actions = (id: number) =>
      Array.from(
        rows
          .find(row => row.dataset["absence"] === String(id))!
          .querySelectorAll<HTMLButtonElement>("[data-absence-decision]")
      ).map(item => item.dataset["absenceDecision"])
    // S2/S6: HR resolves a pending request and withdraws an approved one; resolved rows offer none.
    expect(actions(1)).toEqual(["APROBADA", "RECHAZADA"])
    expect(actions(2)).toEqual(["RETIRADA"])
    expect(actions(3)).toEqual([])
    expect(actions(4)).toEqual([])
    expect(actions(5)).toEqual([])
    s.http.expectNone(() => true)
  })

  it("approves with the HR observation and refreshes the queue exactly once", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto()]))
    await s.settle()

    await s.click(s.element().querySelector("[data-absence-decision='APROBADA']")!, "Aprobar")
    expect(decisionHost()).not.toBeNull()
    const confirmation = decisionHost()!.textContent!
    expect(confirmation).toContain("Personal 30")
    expect(confirmation).toContain("2026-04-06")
    expect(confirmation).toContain("Pendiente")
    expect(confirmation).toContain("Aprobada")

    const observation = decisionHost()!.querySelector<HTMLTextAreaElement>(
      "#absence-resolution-observation"
    )!
    observation.value = "  Servicios reasignados  "
    observation.dispatchEvent(new Event("input"))
    await settleOverlay(s)
    await s.click(decisionButton("Aprobar ausencia"), "Aprobar ausencia")

    const patch = s.http.expectOne({ url: `${api}/9/estado`, method: "PATCH" })
    expect(patch.request.body).toEqual({
      estado: "APROBADA",
      observacion: "Servicios reasignados"
    })
    expect(patch.request.transferCache).toBe(false)
    patch.flush(dto(9, "APROBADA", { fechaResolucion: stamp }))
    await settleOverlay(s)

    expect(s.toast.success).toHaveBeenCalledTimes(1)
    s.listRequest().flush(page([dto(9, "APROBADA", { fechaResolucion: stamp })]))
    await s.settle()
    expect(decisionHost()).toBeNull()
    s.http.expectNone(() => true)
  })

  it("sends a blank HR observation as null and refuses to dispatch while a write is pending", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto()]))
    await s.settle()
    await s.click(s.element().querySelector("[data-absence-decision='RECHAZADA']")!, "Rechazar")
    await s.click(decisionButton("Rechazar ausencia"), "Rechazar ausencia")
    const patch = s.http.expectOne({ url: `${api}/9/estado`, method: "PATCH" })
    expect(patch.request.body).toEqual({ estado: "RECHAZADA", observacion: null })
    // Pending: a repeated confirmation cannot dispatch a second write.
    const pendingSubmit = decisionHost()!.querySelector<HTMLButtonElement>("button[type=submit]")!
    expect(pendingSubmit.disabled).toBe(true)
    // Nor can the overlay be dismissed while the write is in flight.
    expect(decisionButton("Cancelar")!.disabled).toBe(true)
    s.http.expectNone(r => r.method === "PATCH")
    patch.flush(dto(9, "RECHAZADA", { fechaResolucion: stamp }))
    await settleOverlay(s)
    s.listRequest().flush(page([dto(9, "RECHAZADA")]))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("bounds the optional observación to the documented 250 characters", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto()]))
    await s.settle()
    await s.click(s.element().querySelector("[data-absence-decision='APROBADA']")!, "Aprobar")
    const fill = async (value: string) => {
      const field = decisionHost()!.querySelector<HTMLTextAreaElement>(
        "#absence-resolution-observation"
      )!
      field.value = value
      field.dispatchEvent(new Event("input"))
      await settleOverlay(s)
    }
    await fill("o".repeat(251))
    await s.click(decisionButton("Aprobar ausencia"), "Aprobar ausencia")
    // The documented bound refuses before dispatch and keeps the draft visible.
    s.http.expectNone(r => r.method === "PATCH")
    expect(decisionHost()!.textContent).toMatch(/250/)
    expect(
      decisionHost()!.querySelector<HTMLTextAreaElement>("#absence-resolution-observation")!.value
    ).toHaveLength(251)

    await fill("o".repeat(250))
    await s.click(decisionButton("Aprobar ausencia"), "Aprobar ausencia")
    const patch = s.http.expectOne({ url: `${api}/9/estado`, method: "PATCH" })
    expect(patch.request.body.observacion as string).toHaveLength(250)
    patch.flush(dto(9, "APROBADA", { fechaResolucion: stamp }))
    await settleOverlay(s)
    s.listRequest().flush(page([dto(9, "APROBADA")]))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("keeps the confirmation open with safe copy and no refresh when the server refuses", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto()]))
    await s.settle()
    await s.click(s.element().querySelector("[data-absence-decision='APROBADA']")!, "Aprobar")
    await s.click(decisionButton("Aprobar ausencia"), "Aprobar ausencia")
    s.http
      .expectOne({ url: `${api}/9/estado`, method: "PATCH" })
      .flush({ mensaje: "RAW BACKEND CONFLICT DETAIL" }, { status: 409, statusText: "Conflict" })
    await settleOverlay(s)

    expect(decisionHost()).not.toBeNull()
    const text = decisionHost()!.textContent!
    expect(text).toMatch(/conflicto/i)
    expect(text).not.toContain("RAW BACKEND CONFLICT DETAIL")
    expect(s.toast.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
  })

  it("withdraws an approved absence through its own confirmation", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto(9, "APROBADA")]))
    await s.settle()
    await s.click(s.element().querySelector("[data-absence-decision='RETIRADA']")!, "Retirar")
    expect(decisionHost()!.textContent).toContain("Retirada")
    await s.click(decisionButton("Retirar ausencia"), "Retirar ausencia")
    const patch = s.http.expectOne({ url: `${api}/9/estado`, method: "PATCH" })
    expect(patch.request.body.estado).toBe("RETIRADA")
    patch.flush(dto(9, "RETIRADA", { fechaResolucion: stamp }))
    await settleOverlay(s)
    s.listRequest().flush(page([dto(9, "RETIRADA")]))
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("reads one absence only when its detail is opened, and prints the supplied resolution", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto(9, "APROBADA")]))
    await s.settle()
    // No N+1: the list alone dispatches nothing more.
    s.http.expectNone(() => true)

    await s.click(s.button("Ver detalle"), "Ver detalle")
    const request = s.http.expectOne(`${api}/9`)
    expect(request.request.method).toBe("GET")
    request.flush(
      dto(9, "APROBADA", {
        observacionResolucion: "Servicios reasignados",
        fechaResolucion: stamp
      })
    )
    await s.settle()
    const detail = s.element().querySelector("[data-absence-detail]")
    expect(detail?.textContent).toContain("Servicios reasignados")
    expect(detail?.textContent).toContain("Motivo reservado 9")

    await s.click(s.button("Cerrar detalle"), "Cerrar detalle")
    expect(s.element().querySelector("[data-absence-detail]")).toBeNull()
    s.http.expectNone(() => true)
  })

  it("keeps a retryable alert for the queue and refetches only on request", async () => {
    const s = await setup()
    s.listRequest().flush(
      { mensaje: "RAW INTERNAL DETAIL" },
      { status: 500, statusText: "Server Error" }
    )
    await s.settle()
    const alert = s.element().querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(s.element().textContent).not.toContain("RAW INTERNAL DETAIL")
    s.http.expectNone(() => true)
    await s.click(s.button("Reintentar"), "Reintentar")
    s.listRequest().flush(page([dto()]))
    await s.settle()
    expect(s.element().querySelector('[role="alert"]')).toBeNull()
    s.http.expectNone(() => true)
  })
})
