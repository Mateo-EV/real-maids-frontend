import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { getDebugNode, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { BehaviorSubject, of, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HotToastService } from "@ngxpert/hot-toast"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import * as Actions from "../../../application/use-cases/acquisition.use-cases"
import { Lead } from "../../../domain/entities/lead.entity"
import { LeadOrigin } from "../../../domain/entities/lead-origin.entity"
import { FunnelStage } from "../../../domain/entities/funnel-stage.entity"
import { CustomerError } from "../../../domain/errors/customer.error"
import { LeadsPage } from "../../pages/leads-page/leads-page"

const origin = LeadOrigin.create(11, "Origen real", null, false)
const stage = FunnelStage.create(12, "Etapa real", 9, true)
const lead = Lead.create(7, 11, 12, "Prospecto", null, null, null, null, false, new Date(0), null)
async function setup(server = false) {
  const response = new Subject<Result<Lead, CustomerError>>()
  const origins: Subject<Result<readonly LeadOrigin[], CustomerError>>[] = []
  const stages: Subject<Result<readonly FunnelStage[], CustomerError>>[] = []
  const catalog = <T>(requests: Subject<Result<readonly T[], CustomerError>>[]) =>
    vi.fn(() => {
      const request = new Subject<Result<readonly T[], CustomerError>>()
      requests.push(request)
      return request
    })
  const readOrigins = catalog(origins),
    readStages = catalog(stages)
  const create = vi.fn(() => response),
    success = vi.fn()
  const list = vi.fn(() => of(Result.success({ items: [lead], total: 45, offset: 5, limit: 5 })))
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "test@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    imports: [LeadsPage],
    providers: [
      provideRouter([]),
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      { provide: HotToastService, useValue: { success } },
      { provide: Actions.ListLeadsUseCase, useValue: { execute: list } },
      { provide: Actions.ListLeadOriginsUseCase, useValue: { execute: readOrigins } },
      { provide: Actions.ListFunnelStagesUseCase, useValue: { execute: readStages } },
      { provide: Actions.CreateLeadUseCase, useValue: { execute: create } },
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const fixture = TestBed.createComponent(LeadsPage),
    root = fixture.nativeElement as HTMLElement
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const dialog = () => document.querySelector<HTMLElement>("app-lead-editor")!
  const click = async (label: string, within: ParentNode = root) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const fill = async (field: string, value: string) => {
    const input = dialog().querySelector<HTMLInputElement | HTMLSelectElement>(`#lead-${field}`)!
    input.value = value
    input.dispatchEvent(
      new Event(input.tagName === "SELECT" ? "change" : "input", { bubbles: true })
    )
    input.dispatchEvent(new Event("blur"))
    await settle()
  }
  const submit = async () => {
    dialog()
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  const catalogs = async () => {
    origins.at(-1)!.next(Result.success([origin]))
    origins.at(-1)!.complete()
    stages.at(-1)!.next(Result.success([stage]))
    stages.at(-1)!.complete()
    await settle()
  }
  const valid = async () => {
    await catalogs()
    await fill("originId", "11")
    await fill("stageId", "12")
    await fill("name", " Nuevo ")
  }
  const overlay = () => getDebugNode(dialog())!.injector.get(CdkDialogRef).overlayRef
  await settle()
  return {
    fixture,
    root,
    dialog,
    click,
    fill,
    submit,
    settle,
    catalogs,
    valid,
    overlay,
    response,
    create,
    success,
    list,
    session,
    origins,
    stages,
    readOrigins,
    readStages
  }
}
afterEach(() => vi.restoreAllMocks())
describe("WP6 lead creation through inbox", () => {
  it("opens one create-only editor lazily, with blank required choices and actual catalog labels/IDs", async () => {
    const s = await setup()
    expect(s.readOrigins).not.toHaveBeenCalled()
    expect(s.readStages).not.toHaveBeenCalled()
    await s.click("Crear prospecto")
    await s.click("Crear prospecto")
    expect(document.querySelectorAll("app-lead-editor")).toHaveLength(1)
    expect(s.dialog().textContent).toContain("Cargando orígenes")
    expect(s.dialog().textContent).toContain("Cargando etapas")
    await s.catalogs()
    for (const field of ["originId", "stageId"])
      expect(s.dialog().querySelector<HTMLSelectElement>(`#lead-${field}`)!.value).toBe("")
    expect(s.dialog().textContent).toContain("Origen real · ID 11 · Inactivo")
    expect(s.dialog().textContent).toContain("Etapa real · ID 12 · Final")
    expect(s.dialog().textContent).not.toMatch(/Editar|Convertido|Registro|Cliente vinculado/)
    await s.submit()
    expect(s.create).not.toHaveBeenCalled()
    expect(s.dialog().textContent).toContain("Selecciona")
  })
  it("trims only writable fields, accepts contract-only phone and unbounded observation; success alone refreshes effective inbox once", async () => {
    const s = await setup()
    await s.click("Crear prospecto")
    await s.valid()
    await s.fill("phone", " ext. A ")
    await s.fill("referenceAddress", " Dirección ")
    await s.fill("email", " lead@example.test ")
    await s.fill("observation", " <b>" + "x".repeat(600) + "</b> ")
    await s.submit()
    await s.submit()
    expect(s.create).toHaveBeenCalledExactlyOnceWith({
      originId: 11,
      stageId: 12,
      name: "Nuevo",
      email: "lead@example.test",
      phone: "ext. A",
      referenceAddress: "Dirección",
      observation: "<b>" + "x".repeat(600) + "</b>"
    })
    expect(s.success).not.toHaveBeenCalled()
    expect(s.list).toHaveBeenCalledTimes(1)
    s.response.next(Result.success(lead))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Prospecto creado correctamente.")
    expect(s.list).toHaveBeenCalledTimes(2)
    expect(s.list).toHaveBeenLastCalledWith({ offset: 5, limit: 5 })
    expect(s.root.textContent).toContain("6–6 de 45 prospectos")
    expect(
      s.root.querySelector("a[aria-label='Ver prospecto Prospecto']")?.getAttribute("href")
    ).toContain("offset=5&limit=5")
  })
  it("maps blank nullable optionals to null", async () => {
    const s = await setup()
    await s.click("Crear prospecto")
    await s.valid()
    for (const field of ["email", "phone", "referenceAddress", "observation"])
      await s.fill(field, "  ")
    await s.submit()
    expect(s.create).toHaveBeenCalledExactlyOnceWith({
      originId: 11,
      stageId: 12,
      name: "Nuevo",
      email: null,
      phone: null,
      referenceAddress: null,
      observation: null
    })
  })
  it.each([
    ["name", " ", "nombre"],
    ["name", "n".repeat(121), "120"],
    ["email", "bad", "correo"],
    ["email", "a".repeat(111) + "@test.test", "120"],
    ["phone", "a".repeat(31), "30"],
    ["referenceAddress", "a".repeat(201), "200"]
  ])("rejects invalid %s via visible form errors", async (field, value, message) => {
    const s = await setup()
    await s.click("Crear prospecto")
    await s.valid()
    await s.fill(field, value)
    await s.submit()
    expect(s.create).not.toHaveBeenCalled()
    expect(s.dialog().textContent).toContain(message)
  })
  it("keeps independent catalog errors, does not fake empty, retries explicitly without losing draft", async () => {
    const s = await setup()
    await s.click("Crear prospecto")
    await s.fill("name", "Borrador")
    s.origins[0].next(Result.failure(new CustomerError("FORBIDDEN")))
    s.origins[0].complete()
    s.stages[0].next(Result.success([]))
    s.stages[0].complete()
    await s.settle()
    expect(s.dialog().textContent).toContain("No se pudieron cargar los orígenes")
    expect(s.dialog().textContent).not.toContain("No hay orígenes")
    expect(s.dialog().textContent).toContain("No hay etapas")
    await s.click("Reintentar orígenes", s.dialog())
    expect(s.readOrigins).toHaveBeenCalledTimes(2)
    expect(s.readStages).toHaveBeenCalledTimes(1)
    expect(s.dialog().querySelector<HTMLInputElement>("#lead-name")!.value).toBe("Borrador")
    await s.submit()
    expect(s.create).not.toHaveBeenCalled()
  })
  it("preserves selection during same-session refresh and blocks dispatch after selected catalog identity disappears", async () => {
    const s = await setup()
    await s.click("Crear prospecto")
    await s.valid()
    await s.click("Actualizar orígenes", s.dialog())
    expect(s.dialog().querySelector<HTMLSelectElement>("#lead-originId")!.value).toBe("11")
    expect(s.dialog().textContent).toContain("Actualizando orígenes")
    s.origins[1].next(Result.success([]))
    s.origins[1].complete()
    await s.settle()
    await s.submit()
    expect(s.create).not.toHaveBeenCalled()
    expect(s.dialog().textContent).toContain("Selecciona")
  })
  it.each(["FORBIDDEN", "NETWORK", "INVALID_RESPONSE", "CONFLICT"] as const)(
    "preserves draft on safe %s failure without success/reload/replay",
    async code => {
      const s = await setup()
      await s.click("Crear prospecto")
      await s.valid()
      await s.submit()
      s.response.next(Result.failure(new CustomerError(code)))
      await s.settle()
      expect(s.dialog().querySelector<HTMLInputElement>("#lead-name")!.value).toBe(" Nuevo ")
      expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.list).toHaveBeenCalledTimes(1)
      expect(s.create).toHaveBeenCalledTimes(1)
      await s.submit()
      expect(s.create).toHaveBeenCalledTimes(2)
    }
  )
  it("guards pending Cancel/Escape/outside and duplicate save; idle dismissal cancels catalog reads", async () => {
    const s = await setup()
    await s.click("Crear prospecto")
    await s.valid()
    await s.submit()
    const overlay = s.overlay(),
      editor = s.dialog()
    expect(
      [...editor.querySelectorAll<HTMLButtonElement>("button")].find(
        b => b.textContent?.trim() === "Cancelar"
      )!.disabled
    ).toBe(true)
    ;(overlay.keydownEvents() as Subject<KeyboardEvent>).next(
      new KeyboardEvent("keydown", { key: "Escape" })
    )
    ;(overlay.backdropClick() as Subject<MouseEvent>).next(new MouseEvent("click"))
    ;(overlay.outsidePointerEvents() as Subject<MouseEvent>).next(new MouseEvent("click"))
    await s.settle()
    expect(s.dialog()).toBe(editor)
    await s.submit()
    expect(s.create).toHaveBeenCalledTimes(1)
    s.response.next(Result.failure(new CustomerError("NETWORK")))
    await s.settle()
    await s.click("Cancelar", editor)
    expect(s.success).not.toHaveBeenCalled()
  })
  it.each(["logout", "replacement", "destruction"])(
    "cancels pending creation and fences feedback on %s",
    async change => {
      const s = await setup()
      await s.click("Crear prospecto")
      await s.valid()
      await s.submit()
      expect(s.response.observed).toBe(true)
      if (change === "destruction") s.fixture.destroy()
      else
        s.session.next(
          change === "logout"
            ? null
            : AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8)
        )
      expect(s.response.observed).toBe(false)
      s.response.next(Result.success(lead))
      if (change !== "destruction") await s.settle()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.list).toHaveBeenCalledTimes(1)
    }
  )
  it("same-session renewal preserves pending creation", async () => {
    const s = await setup()
    await s.click("Crear prospecto")
    await s.valid()
    await s.submit()
    const current = s.session.value!
    s.session.next(
      AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
    )
    expect(s.response.observed).toBe(true)
    s.response.next(Result.success(lead))
    await s.settle()
    expect(s.success).toHaveBeenCalledTimes(1)
  })
  it("cancels catalog requests on owner destruction and does not dispatch SSR catalogs/writes", async () => {
    const s = await setup()
    await s.click("Crear prospecto")
    s.fixture.destroy()
    expect(s.origins[0].observed).toBe(false)
    expect(s.stages[0].observed).toBe(false)
  })
  it.each(["escape", "backdrop", "outside"])(
    "allows idle %s dismissal and fences closing-animation submission",
    async dismissal => {
      const s = await setup()
      await s.click("Crear prospecto")
      const editor = s.dialog(),
        overlay = s.overlay()
      if (dismissal === "escape")
        (overlay.keydownEvents() as Subject<KeyboardEvent>).next(
          new KeyboardEvent("keydown", { key: "Escape" })
        )
      else if (dismissal === "backdrop")
        (overlay.backdropClick() as Subject<MouseEvent>).next(new MouseEvent("click"))
      else (overlay.outsidePointerEvents() as Subject<MouseEvent>).next(new MouseEvent("click"))
      editor
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await s.settle()
      expect(s.create).not.toHaveBeenCalled()
      expect(s.success).not.toHaveBeenCalled()
      expect(overlay.hasAttached()).toBe(false)
    }
  )
  it("reuses fresh verified catalogs on reopen without replacing draft choices on a successful refresh", async () => {
    const s = await setup()
    await s.click("Crear prospecto")
    await s.valid()
    await s.click("Actualizar etapas", s.dialog())
    expect(s.dialog().querySelector<HTMLSelectElement>("#lead-stageId")!.value).toBe("12")
    s.stages[1].next(Result.success([stage]))
    s.stages[1].complete()
    await s.settle()
    expect(s.dialog().querySelector<HTMLSelectElement>("#lead-stageId")!.value).toBe("12")
    await s.click("Cancelar", s.dialog())
    await s.click("Crear prospecto")
    expect(s.readOrigins).toHaveBeenCalledTimes(1)
    expect(s.readStages).toHaveBeenCalledTimes(2)
    expect(s.dialog().querySelector<HTMLSelectElement>("#lead-stageId")!.value).toBe("")
  })
  it("failed stage revalidation preserves selection visibly but requires explicit successful retry before dispatch", async () => {
    const s = await setup()
    await s.click("Crear prospecto")
    await s.valid()
    await s.click("Actualizar etapas", s.dialog())
    s.stages[1].next(Result.failure(new CustomerError("NETWORK")))
    s.stages[1].complete()
    await s.settle()
    await s.submit()
    expect(s.create).not.toHaveBeenCalled()
    expect(s.dialog().querySelector<HTMLSelectElement>("#lead-stageId")!.value).toBe("12")
    await s.click("Reintentar etapas", s.dialog())
    s.stages[2].next(Result.success([stage]))
    s.stages[2].complete()
    await s.settle()
    await s.submit()
    expect(s.create).toHaveBeenCalledTimes(1)
    expect(s.readOrigins).toHaveBeenCalledTimes(1)
  })
  it("fences the post-await success callback if session changes after Result delivery", async () => {
    const s = await setup()
    await s.click("Crear prospecto")
    await s.valid()
    await s.submit()
    s.response.next(Result.success(lead))
    s.session.next(null)
    await s.settle()
    expect(s.success).not.toHaveBeenCalled()
  })
  it("does not open or request catalogs in SSR", async () => {
    const s = await setup(true)
    await s.click("Crear prospecto")
    expect(s.dialog()).toBeNull()
    expect(s.readOrigins).not.toHaveBeenCalled()
    expect(s.readStages).not.toHaveBeenCalled()
    expect(s.create).not.toHaveBeenCalled()
  })
})
