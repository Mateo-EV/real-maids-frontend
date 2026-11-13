import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { getDebugNode, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, of, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HotToastService } from "@ngxpert/hot-toast"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { CUSTOMERS_ROUTES } from "../../../customers.routes"
import * as Actions from "../../../application/use-cases/acquisition.use-cases"
import { Lead } from "../../../domain/entities/lead.entity"
import { LeadFollowUp } from "../../../domain/entities/lead-follow-up.entity"
import { FunnelStage } from "../../../domain/entities/funnel-stage.entity"
import { GetCustomerStatisticsUseCase } from "../../../application/use-cases/get-customer-statistics.use-case"
import { CustomerError } from "../../../domain/errors/customer.error"
import { LeadFollowUps } from "../../components/lead-follow-ups/lead-follow-ups"

const lead = (id = 7) =>
  Lead.create(id, 11, 12, `Prospecto ${id}`, null, null, null, null, true, new Date(0), null)
const stage = FunnelStage.create(31, "Etapa suministrada", 2, true)
const record = LeadFollowUp.create(9, 7, 21, 31, "Anterior", new Date(0))
async function setup(server = false) {
  const profiles: Subject<Result<Lead, CustomerError>>[] = []
  const reads: Subject<Result<readonly LeadFollowUp[], CustomerError>>[] = []
  const catalogs: Subject<Result<readonly FunnelStage[], CustomerError>>[] = []
  const writes: Subject<Result<LeadFollowUp, CustomerError>>[] = []
  const request = <T>(queue: Subject<T>[]) =>
    vi.fn(() => {
      const response = new Subject<T>()
      queue.push(response)
      return response
    })
  const profile = request(profiles),
    read = request(reads),
    stages = request(catalogs),
    add = request(writes),
    success = vi.fn()
  const unexpected = vi.fn(() => {
    throw new Error("Unexpected lookup/write")
  })
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "test@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: "admin/customers",
          children: CUSTOMERS_ROUTES.map(r => ({ ...r, canActivate: [] }))
        }
      ]),
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      { provide: Actions.GetLeadUseCase, useValue: { execute: profile } },
      { provide: Actions.ListLeadFollowUpsUseCase, useValue: { execute: read } },
      { provide: Actions.ListFunnelStagesUseCase, useValue: { execute: stages } },
      { provide: Actions.AddLeadFollowUpUseCase, useValue: { execute: add } },
      // The CRM shell owns both KPI aggregates; keep them stubbed so only the consumer is read.
      {
        provide: GetCustomerStatisticsUseCase,
        useValue: { execute: () => of(Result.success({ total: 0, activos: 0, inactivos: 0 })) }
      },
      {
        provide: Actions.GetLeadStatisticsUseCase,
        useValue: { execute: () => of(Result.success({ total: 0, convertidos: 0, pendientes: 0 })) }
      },
      ...[
        Actions.ListLeadOriginsUseCase,
        Actions.ListLeadsUseCase,
        Actions.ConvertLeadUseCase,
        Actions.CreateLeadUseCase,
        Actions.UpdateLeadUseCase
      ].map(provide => ({ provide, useValue: { execute: unexpected } })),
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const harness = await RouterTestingHarness.create("/admin/customers/leads/7")
  // The routed parent is the CRM shell (navigation + KPIs): keep every assertion and the
  // route-local toast scope on the detail consumer rather than the shell's root instance.
  const root = () => harness.routeNativeElement!.querySelector<HTMLElement>("app-lead-detail-page")!
  vi.spyOn(getDebugNode(root())!.injector.get(HotToastService), "success").mockImplementation(
    success
  )
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  const respond = async <T>(queue: Subject<T>[], value: T) => {
    queue.at(-1)!.next(value)
    queue.at(-1)!.complete()
    await settle()
  }
  const disclosure = () => root().querySelector<HTMLDetailsElement>("details")!
  const dialog = () => document.querySelector<HTMLElement>("app-lead-follow-up-editor")!
  const panel = () => root().querySelector("app-lead-follow-ups")!
  const click = async (label: string, within: ParentNode = root()) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const open = async () => {
    await respond(profiles, Result.success(lead()))
    disclosure().open = true
    disclosure().dispatchEvent(new Event("toggle"))
    await settle()
    await respond(reads, Result.success([record]))
    await click("Registrar seguimiento")
  }
  const fill = async (field: string, value: string) => {
    const control = dialog().querySelector<HTMLInputElement | HTMLSelectElement>(
      `#follow-up-${field}`
    )!
    control.value = value
    control.dispatchEvent(
      new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true })
    )
    control.dispatchEvent(new Event("blur"))
    await settle()
  }
  const submit = async () => {
    dialog()
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  const valid = async () => {
    await respond(catalogs, Result.success([stage]))
    await fill("stageId", "31")
  }
  const overlay = () => getDebugNode(dialog())!.injector.get(CdkDialogRef).overlayRef
  await settle()
  return {
    harness,
    root,
    settle,
    respond,
    disclosure,
    panel,
    dialog,
    click,
    open,
    fill,
    submit,
    valid,
    overlay,
    profiles,
    reads,
    catalogs,
    writes,
    profile,
    read,
    stages,
    add,
    success,
    session,
    unexpected
  }
}
afterEach(() => vi.restoreAllMocks())
describe("T7 follow-up registration through verified open detail with real store", () => {
  it("projects one lazy registration action into the panel header and captures supplied name/ID without extra lookups", async () => {
    const s = await setup()
    expect(s.stages).not.toHaveBeenCalled()
    expect(s.add).not.toHaveBeenCalled()
    await s.open()
    const button = [...s.panel().querySelectorAll("button")].find(
      b => b.textContent?.trim() === "Registrar seguimiento"
    )!
    expect(button.closest("header")).not.toBeNull()
    expect(s.panel().textContent).not.toContain("Solo lectura")
    await s.click("Registrar seguimiento")
    expect(document.querySelectorAll("app-lead-follow-up-editor")).toHaveLength(1)
    expect(s.dialog().textContent).toContain("Prospecto 7 · ID 7")
    expect(s.dialog().textContent).toContain("Cargando etapas")
    expect(s.profile).toHaveBeenCalledTimes(1)
    expect(s.stages).toHaveBeenCalledTimes(1)
    expect(s.unexpected).not.toHaveBeenCalled()
    await s.valid()
    expect(s.dialog().querySelector('option[value="31"]')?.textContent?.trim()).toBe(
      "Etapa suministrada · Final"
    )
    expect(s.dialog().querySelectorAll("input, select, textarea")).toHaveLength(2)
  })
  it.each(["", "  ", " <b>" + "x".repeat(700) + "</b> "])(
    "sends the complete fixed-owner payload with nullable trimmed unbounded comment %j only once",
    async comment => {
      const s = await setup()
      await s.open()
      await s.valid()
      await s.fill("comment", comment)
      await s.submit()
      await s.submit()
      expect(s.add).toHaveBeenCalledExactlyOnceWith({
        leadId: 7,
        stageId: 31,
        comment: comment.trim() || null
      })
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read).toHaveBeenCalledTimes(1)
      await s.respond(s.writes, Result.success(record))
      expect(s.success).toHaveBeenCalledExactlyOnceWith("Seguimiento registrado correctamente.")
      expect(s.read).toHaveBeenCalledTimes(2)
      // Existing store invalidation also revalidates the profile, without a PUT or local stage patch.
      expect(s.profile).toHaveBeenCalledTimes(2)
      expect(s.root().textContent).toContain("12")
      expect(s.unexpected).not.toHaveBeenCalled()
    }
  )
  it("requires a blank-start verified stage and blocks pending, empty and failed catalogs without losing comment", async () => {
    const s = await setup()
    await s.open()
    await s.fill("comment", "Borrador")
    expect(s.dialog().querySelector<HTMLSelectElement>("select")!.value).toBe("")
    await s.submit()
    expect(s.add).not.toHaveBeenCalled()
    await s.respond(s.catalogs, Result.success([]))
    await s.submit()
    expect(s.dialog().textContent).toContain("No hay etapas")
    await s.click("Actualizar etapas", s.dialog())
    await s.respond(s.catalogs, Result.failure(new CustomerError("NETWORK")))
    expect(s.dialog().textContent).toContain("No se pudieron cargar las etapas")
    await s.click("Reintentar etapas", s.dialog())
    await s.valid()
    await s.submit()
    expect(s.add).toHaveBeenCalledExactlyOnceWith({ leadId: 7, stageId: 31, comment: "Borrador" })
  })
  it("retains a selected missing ID/draft across refresh and failure, requiring explicit verified reselection", async () => {
    const s = await setup()
    await s.open()
    await s.valid()
    await s.fill("comment", "Conservar")
    await s.click("Actualizar etapas", s.dialog())
    await s.submit()
    expect(s.add).not.toHaveBeenCalled()
    await s.respond(s.catalogs, Result.failure(new CustomerError("FORBIDDEN")))
    await s.submit()
    expect(s.dialog().querySelector<HTMLSelectElement>("select")!.value).toBe("31")
    await s.click("Reintentar etapas", s.dialog())
    await s.respond(s.catalogs, Result.success([FunnelStage.create(32, "Otra", 1, false)]))
    expect(s.dialog().querySelector<HTMLSelectElement>("select")!.value).toBe("31")
    expect(s.dialog().textContent).toContain("Etapa no disponible")
    await s.submit()
    expect(s.add).not.toHaveBeenCalled()
    await s.fill("stageId", "32")
    await s.submit()
    expect(s.add).toHaveBeenCalledExactlyOnceWith({ leadId: 7, stageId: 32, comment: "Conservar" })
  })
  it.each(["FORBIDDEN", "CONFLICT", "NETWORK", "INVALID_RESPONSE", "LEAD_NOT_FOUND"] as const)(
    "keeps %s inline safe and preserves draft for explicit POST retry only",
    async code => {
      const s = await setup()
      await s.open()
      await s.valid()
      await s.fill("comment", "Mi borrador")
      await s.submit()
      await s.respond(s.writes, Result.failure(new CustomerError(code)))
      expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
      expect(s.dialog().querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("Mi borrador")
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read).toHaveBeenCalledTimes(1)
      expect(s.add).toHaveBeenCalledTimes(1)
      await s.submit()
      expect(s.add).toHaveBeenCalledTimes(2)
    }
  )
  it("never treats an empty write completion as success", async () => {
    const s = await setup()
    await s.open()
    await s.valid()
    await s.submit()
    s.writes[0].complete()
    await s.settle()
    expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
    expect(s.success).not.toHaveBeenCalled()
    expect(s.read).toHaveBeenCalledTimes(1)
  })
  it("retains stale rows after confirmed-write revalidation failure; GET retry never replays POST", async () => {
    const s = await setup()
    await s.open()
    await s.valid()
    await s.submit()
    await s.respond(s.writes, Result.success(record))
    await s.respond(s.reads, Result.failure(new CustomerError("NETWORK")))
    expect(s.panel().textContent).toContain("Anterior")
    expect(s.panel().textContent).toContain("desactualizados")
    await s.click("Reintentar seguimientos")
    expect(s.read).toHaveBeenCalledTimes(3)
    expect(s.add).toHaveBeenCalledTimes(1)
    await s.respond(s.reads, Result.success([record]))
    expect(s.panel().querySelector('[role="alert"]')).toBeNull()
  })
  it("blocks duplicate save and Cancel/Escape/outside while pending, then allows idle dismissal", async () => {
    const s = await setup()
    await s.open()
    await s.valid()
    await s.submit()
    await s.click("Cancelar", s.dialog())
    ;(s.overlay().keydownEvents() as Subject<KeyboardEvent>).next(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    )
    ;(s.overlay().backdropClick() as Subject<MouseEvent>).next(new MouseEvent("click"))
    ;(s.overlay().outsidePointerEvents() as Subject<MouseEvent>).next(new MouseEvent("click"))
    await s.submit()
    expect(s.add).toHaveBeenCalledTimes(1)
    expect(getDebugNode(s.dialog())!.injector.get(BrnDialogRef).open).toBe(true)
    await s.respond(s.writes, Result.failure(new CustomerError("NETWORK")))
    ;(s.overlay().keydownEvents() as Subject<KeyboardEvent>).next(
      new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
    )
    await s.settle()
    expect(s.dialog()).toBeNull()
  })
  it.each(["route", "logout", "replacement", "destruction", "panel-stop", "native-close"])(
    "cancels/fences pending write and feedback on %s, including closing animation",
    async change => {
      const s = await setup()
      await s.open()
      await s.valid()
      await s.submit()
      const pending = s.writes[0]
      if (change === "route") await s.harness.navigateByUrl("/admin/customers/leads/8")
      else if (change === "logout") s.session.next(null)
      else if (change === "replacement")
        s.session.next(
          AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8)
        )
      else if (change === "destruction") s.harness.fixture.destroy()
      else if (change === "panel-stop") getDebugNode(s.panel())!.injector.get(LeadFollowUps).stop()
      else s.disclosure().open = false // Native close before queued toggle: do not accept post-await feedback.
      if (change !== "native-close") expect(pending.observed).toBe(false)
      pending.next(Result.success(record))
      pending.complete()
      if (change !== "destruction") await s.settle()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.add).toHaveBeenCalledTimes(1)
      // Native close may let an already dispatched write invalidate root observers, but never announces it.
      if (change !== "native-close") expect(s.read).toHaveBeenCalledTimes(1)
    }
  )
  it.each(["route", "panel-stop", "close", "destruction"])(
    "cancels finite stage reads on %s",
    async change => {
      const s = await setup()
      await s.open()
      const pending = s.catalogs[0]
      if (change === "route") await s.harness.navigateByUrl("/admin/customers/leads/8")
      else if (change === "panel-stop") getDebugNode(s.panel())!.injector.get(LeadFollowUps).stop()
      else if (change === "destruction") s.harness.fixture.destroy()
      else {
        s.disclosure().open = false
        s.disclosure().dispatchEvent(new Event("toggle"))
        await s.settle()
      }
      expect(pending.observed).toBe(false)
      expect(s.add).not.toHaveBeenCalled()
      expect(s.success).not.toHaveBeenCalled()
    }
  )
  it("suppresses feedback during the dialog closing animation without accepting cancelled work as success", async () => {
    const s = await setup()
    await s.open()
    await s.valid()
    await s.submit()
    getDebugNode(s.dialog())!.injector.get(BrnDialogRef).close()
    s.writes[0].next(Result.success(record))
    s.writes[0].complete()
    await s.settle()
    expect(s.success).not.toHaveBeenCalled()
    expect(s.add).toHaveBeenCalledTimes(1)
  })
  it("preserves pending work through same-session renewal", async () => {
    const s = await setup()
    await s.open()
    await s.valid()
    await s.fill("comment", "Renovación")
    await s.submit()
    const current = s.session.value!
    s.session.next(
      AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
    )
    await s.settle()
    expect(s.writes[0].observed).toBe(true)
    await s.respond(s.writes, Result.success(record))
    expect(s.success).toHaveBeenCalledTimes(1)
    expect(s.read).toHaveBeenCalledTimes(2)
  })
  it("blocks save/action if native disclosure closes before queued toggle", async () => {
    const s = await setup()
    await s.open()
    await s.valid()
    s.disclosure().open = false
    await s.submit()
    await s.click("Registrar seguimiento")
    expect(s.add).not.toHaveBeenCalled()
    expect(s.stages).toHaveBeenCalledTimes(1)
  })
  it("reuses successful stage TTL on a new dialog and cancels an idle dialog with outside click", async () => {
    const s = await setup()
    await s.open()
    await s.valid()
    ;(s.overlay().outsidePointerEvents() as Subject<MouseEvent>).next(new MouseEvent("click"))
    await s.settle()
    expect(s.dialog()).toBeNull()
    await s.click("Registrar seguimiento")
    expect(s.stages).toHaveBeenCalledTimes(1)
    expect(s.dialog().querySelector<HTMLSelectElement>("select")!.value).toBe("")
  })
  it("does not dispatch profile, stages or registration on SSR", async () => {
    const s = await setup(true)
    expect(s.profile).not.toHaveBeenCalled()
    expect(s.stages).not.toHaveBeenCalled()
    expect(s.add).not.toHaveBeenCalled()
    expect(s.dialog()).toBeNull()
  })
})
