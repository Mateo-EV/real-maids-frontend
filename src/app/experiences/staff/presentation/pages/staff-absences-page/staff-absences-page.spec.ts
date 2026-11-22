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
import { provideFieldOperationsReads } from "@/app/features/field-operations/field-operations.providers"
import { StaffAbsencesPage } from "./staff-absences-page"

const api = "http://localhost:8080/api/ausencias"
const stamp = "2026-04-01T10:00:00Z"

const fieldStaff = () =>
  AuthSession.create("Personal Campo", "campo@example.test", "PERSONAL_CAMPO", null, 11)

/** The documented `AusenciaResponse`; the reason is the text only its owner and HR may read. */
function dto(id = 9, estado = "PENDIENTE", motivo = "Viaje familiar") {
  return {
    idAusencia: id,
    idPersonal: 21,
    nombrePersonal: "Personal 21",
    fechaInicio: "2026-04-06",
    fechaFin: "2026-04-08",
    dias: 3,
    motivo,
    estado,
    observacionResolucion: null,
    fechaRegistro: stamp,
    fechaResolucion: null
  }
}

/** A complete page for the adapter: the item count must match `total` at that offset. */
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
  const session = signal(fieldStaff())
  const toast = { success: vi.fn(), error: vi.fn() }
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideFieldOperationsReads(),
      provideRouter([{ path: "staff/absences", component: StaffAbsencesPage }]),
      { provide: API_URL, useValue: "http://localhost:8080" },
      { provide: AuthStore, useValue: { session } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
      { provide: HotToastService, useValue: toast },
      { provide: PLATFORM_ID, useValue: "browser" }
    ]
  })
  const harness = await RouterTestingHarness.create("/staff/absences")
  const http = TestBed.inject(HttpTestingController)
  const router = TestBed.inject(Router)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement as HTMLElement
  /** Own scope is caller-relative: no staff id, no filter and no reason travels in the URL. */
  const listRequest = (pagina = 0, tamanio = 20) => {
    const pending = http.expectOne(
      candidate =>
        candidate.url === api &&
        candidate.params.get("pagina") === String(pagina) &&
        candidate.params.get("tamanio") === String(tamanio)
    )
    expect(pending.request.method).toBe("GET")
    expect(pending.request.transferCache).toBe(false)
    expect(pending.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
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
  return { harness, http, router, settle, element, listRequest, button, click, toast, session }
}

const dialogHost = () => document.querySelector<HTMLElement>("app-staff-absence-editor")
const decisionHost = () => document.querySelector<HTMLElement>("app-staff-absence-decision-dialog")
const dialogButton = (label: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    item => item.textContent?.trim() === label
  )

afterEach(() => {
  try {
    TestBed.inject(HttpTestingController, null)?.verify()
  } finally {
    vi.restoreAllMocks()
  }
})

describe("StaffAbsencesPage", () => {
  it("renders the caller's own absences with the supplied reason and no staff id in the query", async () => {
    const s = await setup()
    expect(s.element().querySelector('[role="status"]')?.textContent).toMatch(/Cargando ausencias/)
    s.listRequest().flush(
      page([dto(), dto(10, "APROBADA", "Trámite médico"), dto(11, "RECHAZADA", "Sin cobertura")])
    )
    await s.settle()

    const text = s.element().textContent!
    expect(text).toContain("Mis ausencias")
    expect(text).toContain("2026-04-06")
    expect(text).toContain("2026-04-08")
    expect(text).toContain("3")
    expect(text).toContain("Viaje familiar")
    // S7: the reason is visible to its owner, printed as plain text.
    expect(text).toContain("Trámite médico")
    expect(text).toContain("Sin cobertura")
    expect(text).toContain("Pendiente")
    expect(text).toContain("Aprobada")
    expect(text).toContain("Rechazada")
    // Only the pending row may be cancelled by its owner (S6); the rest offers no action.
    expect(s.element().querySelectorAll("[data-absence-cancel]").length).toBe(1)
    // Nothing about the reason leaks into the address bar.
    expect(s.router.url).toBe("/staff/absences")
    s.http.expectNone(() => true)
  })

  it("distinguishes a verified empty list from loading and failure", async () => {
    const s = await setup()
    s.listRequest().flush(page([], 0, 20, 0))
    await s.settle()
    expect(s.element().textContent).toMatch(/no tienes ausencias registradas/i)
    expect(s.button("Solicitar ausencia")).toBeDefined()
    s.http.expectNone(() => true)
  })

  it("keeps a retryable alert for a refusal and refetches only on request", async () => {
    const s = await setup()
    s.listRequest().flush(
      { mensaje: "RAW INTERNAL DETAIL" },
      { status: 403, statusText: "Forbidden" }
    )
    await s.settle()
    const alert = s.element().querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert!.textContent).toMatch(/permiso/i)
    expect(s.element().textContent).not.toContain("RAW INTERNAL DETAIL")
    s.http.expectNone(() => true)
    await s.click(s.button("Reintentar"), "Reintentar")
    s.listRequest().flush(page())
    await s.settle()
    expect(s.element().querySelector('[role="alert"]')).toBeNull()
    s.http.expectNone(() => true)
  })

  it("pages with the effective server size and never a staff filter", async () => {
    const s = await setup()
    s.listRequest(0, 20).flush(
      page(
        Array.from({ length: 10 }, (_, index) => dto(index + 1)),
        0,
        10,
        21
      )
    )
    await s.settle()
    // The server answered an effective size of 10; navigation must use it.
    const next = Array.from(s.element().querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.textContent?.trim() === "2"
    )
    await s.click(next, "2")
    s.listRequest(1, 10).flush(
      page(
        Array.from({ length: 10 }, (_, index) => dto(index + 11)),
        1,
        10,
        21
      )
    )
    await s.settle()
    expect(s.element().textContent).toContain("11–20 de 21")
    s.http.expectNone(() => true)
  })

  it("never renders the reason again once the server denies the read", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto()]))
    await s.settle()
    expect(s.element().textContent).toContain("Viaje familiar")

    // The confirmed cancellation refreshes the visible page; the server then denies that read.
    await s.click(s.element().querySelector("[data-absence-cancel]")!, "Cancelar")
    await s.click(
      Array.from(decisionHost()!.querySelectorAll<HTMLButtonElement>("button")).find(
        item => item.textContent?.trim() === "Cancelar solicitud"
      ),
      "Cancelar solicitud"
    )
    s.http.expectOne({ url: `${api}/9/estado`, method: "PATCH" }).flush(dto(9, "CANCELADA"))
    await s.settle()
    s.listRequest().flush(
      { mensaje: "RAW DENIAL DETAIL" },
      { status: 403, statusText: "Forbidden" }
    )
    await s.settle()

    const denied = s.element().textContent!
    expect(denied).toMatch(/permiso/i)
    expect(denied).not.toContain("Viaje familiar")
    expect(denied).not.toContain("2026-04-06")
    expect(denied).not.toContain("RAW DENIAL DETAIL")
    expect(s.element().querySelectorAll("[data-absence]").length).toBe(0)
    expect(s.element().querySelectorAll("[data-absence-cancel]").length).toBe(0)
    // A denied page cannot claim a range or a total either.
    expect(denied).not.toMatch(/de \d+ registros/)

    // A later transient failure must not resurrect the data the server denied.
    await s.click(s.button("Reintentar"), "Reintentar")
    s.listRequest().flush(
      { mensaje: "RAW SERVER DETAIL" },
      { status: 500, statusText: "Server Error" }
    )
    await s.settle()
    expect(s.element().textContent).not.toContain("Viaje familiar")
    expect(s.element().querySelectorAll("[data-absence]").length).toBe(0)
    s.http.expectNone(() => true)
  })

  it("renders the verified rows again only after an authorised read", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto()]))
    await s.settle()
    await s.click(s.element().querySelector("[data-absence-cancel]")!, "Cancelar")
    await s.click(
      Array.from(decisionHost()!.querySelectorAll<HTMLButtonElement>("button")).find(
        item => item.textContent?.trim() === "Cancelar solicitud"
      ),
      "Cancelar solicitud"
    )
    s.http.expectOne({ url: `${api}/9/estado`, method: "PATCH" }).flush(dto(9, "CANCELADA"))
    await s.settle()
    s.listRequest().flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.element().textContent).not.toContain("Viaje familiar")

    // The intermediate transient failure neither restores data nor ends the denial.
    await s.click(s.button("Reintentar"), "Reintentar")
    s.listRequest().flush({}, { status: 500, statusText: "Server Error" })
    await s.settle()
    expect(s.element().textContent).not.toContain("Viaje familiar")
    expect(s.element().textContent).toMatch(/permiso/i)

    await s.click(s.button("Reintentar"), "Reintentar")
    s.listRequest().flush(page([dto(9, "CANCELADA")]))
    await s.settle()
    expect(s.element().textContent).toContain("Viaje familiar")
    expect(s.element().querySelector('[role="alert"]')).toBeNull()
    s.http.expectNone(() => true)
  })

  it("keeps the denial latched through a later transient failure", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto()]))
    await s.settle()
    // A confirmed cancellation refreshes the page; that refresh is denied.
    await s.click(s.element().querySelector("[data-absence-cancel]")!, "Cancelar")
    await s.click(
      Array.from(decisionHost()!.querySelectorAll<HTMLButtonElement>("button")).find(
        item => item.textContent?.trim() === "Cancelar solicitud"
      ),
      "Cancelar solicitud"
    )
    s.http.expectOne({ url: `${api}/9/estado`, method: "PATCH" }).flush(dto(9, "CANCELADA"))
    await s.settle()
    s.listRequest().flush({}, { status: 403, statusText: "Forbidden" })
    await s.settle()
    expect(s.element().textContent).toMatch(/permiso/i)

    // A denial is not erased by a later transient failure: the protected page stays closed.
    await s.click(s.button("Reintentar"), "Reintentar")
    s.listRequest().flush({}, { status: 500, statusText: "Server Error" })
    await s.settle()
    expect(s.element().textContent).toMatch(/permiso/i)
    expect(s.element().textContent).not.toContain("Viaje familiar")
    expect(s.element().querySelectorAll("[data-absence]").length).toBe(0)
    expect(s.element().querySelector("app-table-pagination")).toBeNull()

    // Nor can a denied page start an action once the transient failure lands.
    await s.click(s.button("Solicitar ausencia"), "Solicitar ausencia")
    expect(document.querySelector("app-staff-absence-editor")).toBeNull()
    s.http.expectNone(() => true)
  })

  it("keeps verified rows and labels them outdated on a transient failure", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto()]))
    await s.settle()
    await s.click(s.element().querySelector("[data-absence-cancel]")!, "Cancelar")
    await s.click(
      Array.from(decisionHost()!.querySelectorAll<HTMLButtonElement>("button")).find(
        item => item.textContent?.trim() === "Cancelar solicitud"
      ),
      "Cancelar solicitud"
    )
    s.http.expectOne({ url: `${api}/9/estado`, method: "PATCH" }).flush(dto(9, "CANCELADA"))
    await s.settle()
    s.listRequest().flush({}, { status: 500, statusText: "Server Error" })
    await s.settle()
    // Transient: the verified rows and their reason stay, with a stale notice.
    expect(s.element().textContent).toContain("Viaje familiar")
    expect(s.element().querySelector('[role="alert"]')?.textContent).toMatch(/desactualizados/i)
    s.http.expectNone(() => true)
  })

  it("requests an own absence, blocks a blank reason before any dispatch and refreshes once", async () => {
    const s = await setup()
    s.listRequest().flush(page())
    await s.settle()

    await s.click(s.button("Solicitar ausencia"), "Solicitar ausencia")
    expect(dialogHost()).not.toBeNull()
    const submit = () =>
      dialogHost()!.querySelector<HTMLButtonElement>("button[type=submit]") as HTMLButtonElement
    submit().click()
    await s.settle()
    // Mandatory reason (S7): nothing is dispatched and the field explains itself.
    s.http.expectNone(r => r.method === "POST")
    expect(dialogHost()!.textContent).toMatch(/obligatorio/i)

    const start = dialogHost()!.querySelector<HTMLInputElement>("#absence-start-date")!
    const end = dialogHost()!.querySelector<HTMLInputElement>("#absence-end-date")!
    const reason = dialogHost()!.querySelector<HTMLTextAreaElement>("#absence-reason")!
    for (const [field, value] of [
      [start, "2026-04-06"],
      [end, "2026-04-08"],
      [reason, "  Viaje familiar  "]
    ] as const) {
      field.value = value
      field.dispatchEvent(new Event("input"))
    }
    await s.settle()
    submit().click()
    await s.settle()

    const post = s.http.expectOne({ url: api, method: "POST" })
    // The documented body only: no staff id, actor, status or browser-derived today.
    expect(post.request.body).toEqual({
      fechaInicio: "2026-04-06",
      fechaFin: "2026-04-08",
      motivo: "Viaje familiar"
    })
    expect(post.request.transferCache).toBe(false)
    post.flush(dto())
    await s.settle()

    // Confirmed success alone: one generic message and exactly one re-read of the visible page.
    expect(s.toast.success).toHaveBeenCalledTimes(1)
    s.listRequest().flush(page())
    await s.settle()
    expect(document.querySelector("app-staff-absence-editor")).toBeNull()
    expect(s.router.url).not.toMatch(/Viaje|motivo/)
    s.http.expectNone(() => true)
  })

  it("bounds the mandatory motivo to the documented 500 characters", async () => {
    const s = await setup()
    s.listRequest().flush(page())
    await s.settle()
    await s.click(s.button("Solicitar ausencia"), "Solicitar ausencia")
    const fill = async (startDate: string, endDate: string, reason: string) => {
      for (const [selector, value] of [
        ["#absence-start-date", startDate],
        ["#absence-end-date", endDate],
        ["#absence-reason", reason]
      ] as const) {
        const field = dialogHost()!.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!
        field.value = value
        field.dispatchEvent(new Event("input"))
      }
      await s.settle()
    }
    await fill("2026-04-06", "2026-04-08", "m".repeat(501))
    dialogHost()!.querySelector<HTMLButtonElement>("button[type=submit]")!.click()
    await s.settle()
    // The documented bound refuses before dispatch and keeps the draft visible.
    s.http.expectNone(r => r.method === "POST")
    expect(dialogHost()!.textContent).toMatch(/500/)
    expect(dialogHost()!.querySelector<HTMLTextAreaElement>("#absence-reason")!.value).toHaveLength(
      501
    )

    await fill("2026-04-06", "2026-04-08", "m".repeat(500))
    dialogHost()!.querySelector<HTMLButtonElement>("button[type=submit]")!.click()
    await s.settle()
    const post = s.http.expectOne({ url: api, method: "POST" })
    expect(post.request.body.motivo).toHaveLength(500)
    post.flush(dto())
    await s.settle()
    s.listRequest().flush(page())
    await s.settle()
    s.http.expectNone(() => true)
  })

  it("keeps the editor open with safe copy and the draft when the server refuses", async () => {
    const s = await setup()
    s.listRequest().flush(page())
    await s.settle()
    await s.click(s.button("Solicitar ausencia"), "Solicitar ausencia")
    const start = dialogHost()!.querySelector<HTMLInputElement>("#absence-start-date")!
    const end = dialogHost()!.querySelector<HTMLInputElement>("#absence-end-date")!
    const reason = dialogHost()!.querySelector<HTMLTextAreaElement>("#absence-reason")!
    for (const [field, value] of [
      [start, "2026-04-06"],
      [end, "2026-04-08"],
      [reason, "Solapada"]
    ] as const) {
      field.value = value
      field.dispatchEvent(new Event("input"))
    }
    await s.settle()
    dialogHost()!.querySelector<HTMLButtonElement>("button[type=submit]")!.click()
    await s.settle()
    s.http
      .expectOne({ url: api, method: "POST" })
      .flush({ mensaje: "RAW BACKEND CONFLICT" }, { status: 409, statusText: "Conflict" })
    await s.settle()

    expect(dialogHost()).not.toBeNull()
    const text = dialogHost()!.textContent!
    expect(text).not.toContain("RAW BACKEND CONFLICT")
    expect(text).toMatch(/solap|conflicto/i)
    expect(reason.value).toBe("Solapada")
    // No success message and no refresh after a failed write.
    expect(s.toast.success).not.toHaveBeenCalled()
    s.http.expectNone(() => true)
  })

  it("cancels a pending request through the owner's own confirmation", async () => {
    const s = await setup()
    s.listRequest().flush(page([dto()]))
    await s.settle()

    const cancel = s.element().querySelector<HTMLButtonElement>("[data-absence-cancel]")!
    await s.click(cancel, "Cancelar")
    expect(decisionHost()).not.toBeNull()
    const confirmation = decisionHost()!.textContent!
    expect(confirmation).toContain("2026-04-06")
    expect(confirmation).toContain("2026-04-08")
    expect(confirmation).toContain("Pendiente")
    expect(confirmation).toContain("Cancelada")

    await s.click(
      Array.from(decisionHost()!.querySelectorAll<HTMLButtonElement>("button")).find(
        item => item.textContent?.trim() === "Cancelar solicitud"
      ),
      "Cancelar solicitud"
    )
    const patch = s.http.expectOne({ url: `${api}/9/estado`, method: "PATCH" })
    expect(patch.request.body).toEqual({ estado: "CANCELADA", observacion: null })
    expect(patch.request.transferCache).toBe(false)
    patch.flush(dto(9, "CANCELADA"))
    await s.settle()

    expect(s.toast.success).toHaveBeenCalledTimes(1)
    s.listRequest().flush(page([dto(9, "CANCELADA")]))
    await s.settle()
    expect(document.querySelector("app-staff-absence-decision-dialog")).toBeNull()
    expect(s.element().querySelectorAll("[data-absence-cancel]").length).toBe(0)
    s.http.expectNone(() => true)
  })
})
