import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { getDebugNode, PLATFORM_ID } from "@angular/core"
import { LeadEditor } from "../../components/lead-editor/lead-editor"
import { HotToastService } from "@ngxpert/hot-toast"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
import { LeadOrigin } from "../../../domain/entities/lead-origin.entity"
import { FunnelStage } from "../../../domain/entities/funnel-stage.entity"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, of, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { CUSTOMERS_ROUTES } from "../../../customers.routes"
import * as Actions from "../../../application/use-cases/acquisition.use-cases"
import { ListCustomersUseCase } from "../../../application/use-cases/list-customers.use-case"
import { Lead } from "../../../domain/entities/lead.entity"
import { CustomerError, CustomerErrorCode } from "../../../domain/errors/customer.error"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"

type DetailResult = Result<Lead, CustomerError>
const lead = (
  id = 7,
  observation: string | null = "<b>Texto literal</b>\nhttps://example.test",
  converted = false
) =>
  Lead.create(
    id,
    11,
    12,
    `Prospecto ${id}`,
    null,
    null,
    null,
    observation,
    converted,
    new Date("2026-06-01T12:30:00Z"),
    null
  )

async function setup(url = "/admin/customers/leads/7", server = false, editing = false) {
  const writeResponse = new Subject<DetailResult>()
  const update = vi.fn(() => writeResponse),
    success = vi.fn()
  const origins = new Subject<Result<readonly LeadOrigin[], CustomerError>>()
  const stages = new Subject<Result<readonly FunnelStage[], CustomerError>>()
  const readOrigins = vi.fn(() => origins),
    readStages = vi.fn(() => stages)
  const requests: Subject<DetailResult>[] = []
  const execute = vi.fn(() => {
    const response = new Subject<DetailResult>()
    requests.push(response)
    return response
  })
  const listRequests: Subject<Result<PaginationResponse<Lead>, CustomerError>>[] = []
  const list = vi.fn(() => {
    const response = new Subject<Result<PaginationResponse<Lead>, CustomerError>>()
    listRequests.push(response)
    return response
  })
  const customers = vi.fn(() => of(Result.success({ items: [], total: 0, offset: 40, limit: 10 })))
  const forbiddenAction = vi.fn(() => {
    throw new Error("Unexpected read/write")
  })
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    providers: [
      provideRouter([
        {
          path: "admin/customers",
          children: CUSTOMERS_ROUTES.map(route => ({ ...route, canActivate: [] }))
        }
      ]),
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      { provide: Actions.GetLeadUseCase, useValue: { execute } },
      { provide: Actions.ListLeadsUseCase, useValue: { execute: list } },
      {
        provide: Actions.CheckLeadEmailUseCase,
        useValue: {
          execute: () => of(Result.success({ customerExists: false, leadExists: false }))
        }
      },
      { provide: ListCustomersUseCase, useValue: { execute: customers } },
      { provide: Actions.ListLeadOriginsUseCase, useValue: { execute: readOrigins } },
      { provide: Actions.ListFunnelStagesUseCase, useValue: { execute: readStages } },
      ...[
        Actions.ListLeadFollowUpsUseCase,
        Actions.ConvertLeadUseCase,
        Actions.CreateLeadUseCase,
        Actions.UpdateLeadUseCase
      ].map(provide => ({ provide, useValue: { execute: forbiddenAction } })),
      ...(editing
        ? [
            { provide: Actions.UpdateLeadUseCase, useValue: { execute: update } },
            { provide: Actions.ListLeadOriginsUseCase, useValue: { execute: readOrigins } },
            { provide: Actions.ListFunnelStagesUseCase, useValue: { execute: readStages } }
          ]
        : []),
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const harness = await RouterTestingHarness.create(url)
  if (editing)
    vi.spyOn(
      harness.routeDebugElement!.injector.get(HotToastService),
      "success"
    ).mockImplementation(success)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  await settle()
  const element = () => harness.routeNativeElement!
  const respond = async (value: DetailResult) => {
    requests.at(-1)!.next(value)
    requests.at(-1)!.complete()
    await settle()
  }
  const click = async (text: string) => {
    const target = Array.from(element().querySelectorAll<HTMLElement>("a, button")).find(
      item => item.textContent?.trim() === text
    )
    expect(target, text).toBeDefined()
    target!.click()
    await settle()
  }
  return {
    harness,
    element,
    execute,
    list,
    listRequests,
    requests,
    session,
    respond,
    click,
    settle,
    forbiddenAction,
    customers,
    update,
    success,
    writeResponse,
    origins,
    stages,
    readOrigins,
    readStages
  }
}
afterEach(() => vi.restoreAllMocks())

describe("Lead read-only detail and independent return context", () => {
  it("loads only the selected lead, shows provided UTC/null/plain text fields without synthetic customer linkage", async () => {
    const s = await setup()
    expect(s.execute).toHaveBeenCalledExactlyOnceWith(7)
    expect(s.readOrigins).not.toHaveBeenCalled()
    expect(s.readStages).not.toHaveBeenCalled()
    expect(s.element().textContent).toContain("Cargando prospecto")
    expect(s.element().textContent).not.toContain("No registrado")
    await s.respond(Result.success(lead()))
    expect(s.element().querySelector("app-catalog-frame")).not.toBeNull()
    for (const text of [
      "Prospecto 7",
      "11",
      "12",
      "No convertido",
      "No registrado",
      "2026-06-01T12:30:00.000Z",
      "<b>Texto literal</b>",
      "https://example.test"
    ])
      expect(s.element().textContent).toContain(text)
    expect(s.element().querySelector("b, a[href='https://example.test'], input, select")).toBeNull()
    expect(s.element().textContent).not.toMatch(/Cliente vinculado|Crear/)
    expect(s.element().querySelector("app-catalog-frame header")?.textContent).toContain(
      "Convertir a cliente"
    )
    expect(s.forbiddenAction).not.toHaveBeenCalled()
    expect(s.list).not.toHaveBeenCalled()
    expect(s.customers).not.toHaveBeenCalled()
    expect(s.element().querySelector("a")?.getAttribute("href")).toBe(
      "/admin/customers/leads?offset=0&limit=20"
    )
  })

  it("preserves converted flag, supplied contacts/address/actor and null observation without inventing values", async () => {
    const s = await setup()
    await s.respond(
      Result.success(
        Lead.create(
          7,
          11,
          12,
          "Nombre",
          "lead@example.test",
          "555",
          "Dirección real",
          null,
          true,
          new Date(0),
          15
        )
      )
    )
    for (const text of [
      "Convertido",
      "lead@example.test",
      "555",
      "Dirección real",
      "15",
      "No registrado",
      "1970-01-01T00:00:00.000Z"
    ])
      expect(s.element().textContent).toContain(text)
    expect(s.forbiddenAction).not.toHaveBeenCalled()
  })

  it.each(["0", "-1", "1.5", "2147483648", "abc", "1e2", "+7", "7x"])(
    "rejects invalid route ID %s before any reads",
    async id => {
      const s = await setup(`/admin/customers/leads/${encodeURIComponent(id)}`)
      expect(s.element().textContent).toContain("Identificador de prospecto inválido")
      expect(s.execute).not.toHaveBeenCalled()
      expect(s.forbiddenAction).not.toHaveBeenCalled()
    }
  )

  it.each([
    ["LEAD_NOT_FOUND", "No se encontró el prospecto"],
    ["FORBIDDEN", "No tienes permiso"],
    ["UNAUTHENTICATED", "Vuelve a iniciar sesión"],
    ["NETWORK", "No se pudo cargar"],
    ["UNCONFIGURED", "no está disponible en este entorno"],
    ["INVALID_RESPONSE", "No se pudo cargar"]
  ] as [CustomerErrorCode, string][])(
    "shows safe %s failure and explicit retry, never false empty",
    async (code, text) => {
      const s = await setup()
      await s.respond(Result.failure(new CustomerError(code)))
      expect(s.element().querySelector('[role="alert"]')?.textContent).toContain(text)
      expect(s.element().textContent).not.toContain("No registrado")
      await s.click("Reintentar")
      expect(s.execute).toHaveBeenCalledTimes(2)
      await s.respond(Result.success(lead()))
      expect(s.element().textContent).toContain("Prospecto 7")
    }
  )

  it("treats an empty read as invalid rather than fabricated detail", async () => {
    const s = await setup()
    s.requests[0].complete()
    await s.settle()
    expect(s.element().querySelector('[role="alert"]')).not.toBeNull()
    expect(s.element().textContent).not.toContain("No registrado")
  })

  it("keeps verified same-ID stale data on expired revisit, refresh and failure, but never another ID", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    await s.respond(Result.success(lead()))
    await s.harness.navigateByUrl("/admin/customers/leads/8")
    await s.settle()
    expect(s.element().textContent).not.toContain("Prospecto 7")
    await s.respond(Result.success(lead(8)))
    clock.mockReturnValue(31000)
    await s.harness.navigateByUrl("/admin/customers/leads/7")
    await s.settle()
    expect(s.element().textContent).toContain("Prospecto 7")
    expect(s.element().textContent).not.toContain("Prospecto 8")
    expect(s.element().textContent).toContain("Actualizando prospecto")
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element().textContent).toContain("desactualizados")
    expect(s.element().textContent).toContain("Prospecto 7")
    await s.click("Reintentar")
    expect(s.execute).toHaveBeenLastCalledWith(7)
    await s.respond(Result.success(lead(7, null)))
    expect(s.element().textContent).not.toContain("desactualizados")
  })

  it("cancels route-old and destroyed reads, fences late completions", async () => {
    const s = await setup()
    const old = s.requests[0]
    await s.harness.navigateByUrl("/admin/customers/leads/8")
    await s.settle()
    expect(old.observed).toBe(false)
    old.next(Result.success(lead()))
    expect(s.element().textContent).not.toContain("Prospecto 7")
    const pending = s.requests[1]
    s.harness.fixture.destroy()
    expect(pending.observed).toBe(false)
    pending.next(Result.success(lead(8)))
    expect(TestBed.inject(CustomerAcquisitionStore).selectLead(8)().data).toBeUndefined()
  })

  it.each(["logout", "replacement"])(
    "clears and cancels on %s, preserving pending/loaded same-session renewal",
    async change => {
      const s = await setup()
      const current = s.session.value!
      s.session.next(
        AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
      )
      await s.settle()
      expect(s.requests[0].observed).toBe(true)
      await s.respond(Result.success(lead()))
      s.session.next(
        AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
      )
      await s.settle()
      expect(s.element().textContent).toContain("Prospecto 7")
      // Select another ID to exercise pending cancellation as well as cached data clearing.
      await s.harness.navigateByUrl("/admin/customers/leads/8")
      await s.settle()
      const pending = s.requests[1]
      s.session.next(
        change === "logout"
          ? null
          : AuthSession.create("Other", "other@example.test", null, current.expiresAt, 8)
      )
      await s.settle()
      expect(pending.observed).toBe(false)
      pending.next(Result.success(lead(8)))
      await s.settle()
      expect(s.element().textContent).not.toMatch(/Prospecto 7|Prospecto 8/)
      expect(s.execute).toHaveBeenCalledTimes(2)
    }
  )

  it("clears a visible verified detail on session replacement without automatically reading as the new owner", async () => {
    const s = await setup()
    await s.respond(Result.success(lead()))
    s.session.next(AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8))
    await s.settle()
    expect(s.element().textContent).not.toContain("Prospecto 7")
    expect(s.element().textContent).not.toContain("Texto literal")
    expect(s.execute).toHaveBeenCalledTimes(1)
  })

  it("shares root detail flights, releasing only the destroyed consumer", async () => {
    const s = await setup()
    const other = TestBed.inject(CustomerAcquisitionStore).observeLead(7).subscribe()
    expect(s.execute).toHaveBeenCalledTimes(1)
    s.harness.fixture.destroy()
    expect(s.requests[0].observed).toBe(true)
    other.unsubscribe()
    expect(s.requests[0].observed).toBe(false)
  })

  it.each([
    [0, 1000],
    [214748364700, 100]
  ])(
    "accepts the documented aligned int32 page/size context %s/%s without imposing a local size cap",
    async (offset, limit) => {
      const s = await setup(`/admin/customers/leads?offset=${offset}&limit=${limit}`)
      expect(s.list).toHaveBeenCalledExactlyOnceWith({ offset, limit })
      await s.harness.navigateByUrl(
        `/admin/customers/leads/2147483647?offset=${offset}&limit=${limit}`
      )
      await s.settle()
      expect(s.execute).toHaveBeenCalledExactlyOnceWith(2147483647)
      expect(s.element().querySelector("a")?.getAttribute("href")).toBe(
        `/admin/customers/leads?offset=${offset}&limit=${limit}`
      )
    }
  )

  it("does not dispatch during SSR", async () => {
    const s = await setup("/admin/customers/leads/7", true)
    expect(s.execute).not.toHaveBeenCalled()
  })

  it.each([
    "",
    "?offset=10",
    "?offset=3&limit=2",
    "?offset=-2&limit=2",
    "?offset=0&limit=0",
    "?offset=0&limit=2147483648",
    "?offset=9007199254740992&limit=1",
    "?offset=2147483648&limit=1",
    "?offset=0&limit=5&limit=10",
    "?offset=0&offset=5&limit=5",
    "?offset=1e2&limit=5"
  ])(
    "defaults malformed/missing context %s before the first list read and in detail back link",
    async suffix => {
      const s = await setup(`/admin/customers/leads${suffix}`)
      expect(s.list).toHaveBeenCalledExactlyOnceWith({ offset: 0, limit: 20 })
      await s.harness.navigateByUrl(`/admin/customers/leads/7${suffix}`)
      await s.settle()
      expect(s.element().querySelector("a")?.getAttribute("href")).toBe(
        "/admin/customers/leads?offset=0&limit=20"
      )
    }
  )

  it("keeps customer and lead URL queries independent without changing customer context", async () => {
    const s = await setup("/admin/customers?offset=40&limit=10")
    expect(s.customers).toHaveBeenCalledExactlyOnceWith({ offset: 40, limit: 10 })
    expect(s.list).not.toHaveBeenCalled()
    await s.harness.navigateByUrl("/admin/customers/leads?offset=10&limit=5")
    await s.settle()
    expect(s.list).toHaveBeenCalledExactlyOnceWith({ offset: 10, limit: 5 })
    await s.harness.navigateByUrl("/admin/customers?offset=40&limit=10")
    await s.settle()
    expect(s.customers).toHaveBeenCalledTimes(1)
    expect(s.list).toHaveBeenCalledTimes(1)
  })

  it("restores URL query before HTTP, links desktop/mobile with actual effective metadata and returns through the real back link", async () => {
    const s = await setup("/admin/customers/leads?offset=20&limit=10")
    expect(s.list).toHaveBeenCalledExactlyOnceWith({ offset: 20, limit: 10 })
    s.listRequests[0].next(Result.success({ items: [lead()], total: 45, offset: 10, limit: 5 }))
    s.listRequests[0].complete()
    await s.settle()
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const link = s.element().querySelector<HTMLAnchorElement>(`${selector} a`)!
      expect(link?.getAttribute("href")).toBe("/admin/customers/leads/7?offset=10&limit=5")
      expect(link?.getAttribute("aria-label")).toBe("Ver prospecto Prospecto 7")
    }
    s.element().querySelector<HTMLAnchorElement>("[catalogDesktop] a")!.click()
    await s.settle()
    expect(s.execute).toHaveBeenCalledExactlyOnceWith(7)
    await s.respond(Result.success(lead()))
    await s.click("Volver a prospectos")
    expect(TestBed.inject(Router).url).toBe("/admin/customers/leads?offset=10&limit=5")
    expect(s.list).toHaveBeenLastCalledWith({ offset: 10, limit: 5 })
    expect(s.list).toHaveBeenCalledTimes(2)
    expect(s.readOrigins).toHaveBeenCalledTimes(2)
    expect(s.readStages).toHaveBeenCalledTimes(2)
    expect(s.forbiddenAction).not.toHaveBeenCalled()
  })
})

async function editSetup(server = false, record = lead()) {
  const s = await setup("/admin/customers/leads/7?offset=10&limit=5", server, true)
  const dialog = () => document.querySelector<HTMLElement>("app-lead-editor")!
  const clickDialog = async (text: string) => {
    const button = [...dialog().querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === text
    )
    expect(button, text).toBeDefined()
    button!.click()
    await s.settle()
  }
  const fill = async (field: string, value: string) => {
    const control = dialog().querySelector<HTMLInputElement | HTMLSelectElement>(`#lead-${field}`)!
    control.value = value
    control.dispatchEvent(
      new Event(control.tagName === "SELECT" ? "change" : "input", { bubbles: true })
    )
    control.dispatchEvent(new Event("blur"))
    await s.settle()
  }
  const submit = async () => {
    dialog()
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await s.settle()
  }
  const catalogs = async (originId = 11, stageId = 12) => {
    s.origins.next(Result.success([LeadOrigin.create(originId, "Origen real", null, false)]))
    s.stages.next(Result.success([FunnelStage.create(stageId, "Etapa real", 9, true)]))
    await s.settle()
  }
  const open = async () => {
    await s.respond(Result.success(record))
    await s.click("Editar prospecto")
  }
  const overlay = () => getDebugNode(dialog())!.injector.get(CdkDialogRef).overlayRef
  return { ...s, dialog, clickDialog, fill, submit, catalogs, open, overlay }
}

describe("WP6 editing a legitimately loaded lead", () => {
  it("offers edit only for verified matching detail; preserves converted records and prefills all writable values", async () => {
    const record = Lead.create(
      7,
      11,
      12,
      "Nombre cargado",
      "lead@example.test",
      "ext. A",
      "Dirección",
      "Observación",
      true,
      new Date(0),
      15
    )
    const s = await editSetup(false, record)
    expect(s.element().textContent).not.toContain("Editar prospecto")
    expect(s.readOrigins).not.toHaveBeenCalled()
    await s.open()
    expect(s.element().querySelector("app-catalog-frame header")?.textContent).toContain(
      "Editar prospecto"
    )
    await s.click("Editar prospecto")
    expect(document.querySelectorAll("app-lead-editor")).toHaveLength(1)
    expect(s.dialog().textContent).toContain("Nombre cargado")
    expect(s.dialog().textContent).toContain("ID 7")
    await s.catalogs()
    for (const [field, value] of Object.entries({
      originId: "11",
      stageId: "12",
      name: record.name,
      email: record.email,
      phone: record.phone,
      referenceAddress: record.referenceAddress,
      observation: record.observation
    }))
      expect(s.dialog().querySelector<HTMLInputElement>(`#lead-${field}`)!.value).toBe(value)
    expect(
      s.dialog().querySelector("#lead-isConverted, #lead-registeredAt, #lead-registeredByUserId")
    ).toBeNull()
    expect(s.update).not.toHaveBeenCalled()
  })

  it("captures fixed ID and full trimmed/null replacement; confirmed success alone revalidates active detail/inbox exactly once", async () => {
    const s = await editSetup()
    const inbox = TestBed.inject(CustomerAcquisitionStore)
      .observeLeads({ offset: 10, limit: 5 })
      .subscribe()
    s.listRequests[0].next(Result.success({ items: [lead()], total: 45, offset: 10, limit: 5 }))
    await s.open()
    await s.catalogs()
    for (const [field, value] of Object.entries({
      name: " Nuevo ",
      email: " ",
      phone: " ext. A ",
      referenceAddress: " ",
      observation: " <b>literal</b> "
    }))
      await s.fill(field, value)
    // Refreshing the same detail cannot replace the captured editor draft or target.
    const refresh = TestBed.inject(CustomerAcquisitionStore).loadLead(7, true).subscribe()
    await s.respond(Result.success(lead(7, "Otro")))
    await s.submit()
    await s.submit()
    expect(s.update).toHaveBeenCalledExactlyOnceWith({
      id: 7,
      originId: 11,
      stageId: 12,
      name: "Nuevo",
      email: null,
      phone: "ext. A",
      referenceAddress: null,
      observation: "<b>literal</b>"
    })
    expect(s.success).not.toHaveBeenCalled()
    expect(s.execute).toHaveBeenCalledTimes(2)
    s.writeResponse.next(Result.success(lead()))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Prospecto actualizado correctamente.")
    expect(s.execute).toHaveBeenCalledTimes(3)
    expect(s.list).toHaveBeenCalledTimes(2)
    expect(s.list).toHaveBeenLastCalledWith({ offset: 10, limit: 5 })
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element().textContent).toContain("desactualizados")
    expect(s.update).toHaveBeenCalledTimes(1)
    expect(s.element().querySelector("a")?.getAttribute("href")).toBe(
      "/admin/customers/leads?offset=10&limit=5"
    )
    refresh.unsubscribe()
    inbox.unsubscribe()
  })

  it("keeps missing loaded association IDs visible and blocks dispatch until explicit verified choices", async () => {
    const s = await editSetup()
    await s.open()
    await s.catalogs(21, 22)
    for (const [field, id] of [
      ["originId", "11"],
      ["stageId", "12"]
    ])
      expect(s.dialog().querySelector<HTMLSelectElement>(`#lead-${field}`)!.value).toBe(id)
    expect(s.dialog().textContent).toContain("Origen no disponible")
    expect(s.dialog().textContent).toContain("Etapa no disponible")
    await s.submit()
    expect(s.update).not.toHaveBeenCalled()
    await s.fill("originId", "21")
    await s.fill("stageId", "22")
    await s.submit()
    expect(s.update).toHaveBeenCalledOnce()
    expect(s.update.mock.calls[0]).toEqual([
      {
        id: 7,
        originId: 21,
        stageId: 22,
        name: "Prospecto 7",
        email: null,
        phone: null,
        referenceAddress: null,
        observation: "<b>Texto literal</b>\nhttps://example.test"
      }
    ])
  })

  it("preserves draft and choices on catalog failure, requires explicit verified retry", async () => {
    const s = await editSetup()
    await s.open()
    await s.catalogs()
    await s.fill("name", "Borrador")
    await s.clickDialog("Actualizar orígenes")
    await s.submit()
    expect(s.update).not.toHaveBeenCalled()
    s.origins.next(Result.failure(new CustomerError("NETWORK")))
    await s.settle()
    await s.submit()
    expect(s.update).not.toHaveBeenCalled()
    expect(s.dialog().querySelector<HTMLInputElement>("#lead-name")!.value).toBe("Borrador")
    expect(s.dialog().querySelector<HTMLSelectElement>("#lead-originId")!.value).toBe("11")
    await s.clickDialog("Reintentar orígenes")
    s.origins.next(Result.success([LeadOrigin.create(11, "Origen real", null, false)]))
    await s.settle()
    await s.submit()
    expect(s.update).toHaveBeenCalledOnce()
  })

  it.each(["FORBIDDEN", "NETWORK", "INVALID_RESPONSE", "CONFLICT"] as const)(
    "keeps safe %s failure inline and retries only explicitly",
    async code => {
      const s = await editSetup()
      await s.open()
      await s.catalogs()
      await s.fill("name", " Borrador ")
      await s.submit()
      s.writeResponse.next(Result.failure(new CustomerError(code)))
      await s.settle()
      expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
      expect(s.dialog().querySelector<HTMLInputElement>("#lead-name")!.value).toBe(" Borrador ")
      expect(s.success).not.toHaveBeenCalled()
      expect(s.execute).toHaveBeenCalledTimes(1)
      expect(s.update).toHaveBeenCalledTimes(1)
      await s.submit()
      expect(s.update).toHaveBeenCalledTimes(2)
    }
  )

  it("blocks pending dismissal and duplicates, then permits idle cancellation", async () => {
    const s = await editSetup()
    await s.open()
    await s.catalogs()
    const editor = s.dialog()
    const save = vi.spyOn(getDebugNode(editor)!.componentInstance as LeadEditor, "save")
    await s.submit()
    const pending = save.mock.results[0].value as Promise<boolean>
    const overlay = s.overlay()
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
    await s.submit()
    expect(s.dialog()).toBe(editor)
    expect(s.update).toHaveBeenCalledOnce()
    s.writeResponse.next(Result.failure(new CustomerError("NETWORK")))
    await pending
    await s.settle()
    expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
    expect(
      [...editor.querySelectorAll<HTMLButtonElement>("button")].find(
        b => b.textContent?.trim() === "Cancelar"
      )!.disabled
    ).toBe(false)
    const dialogRef = getDebugNode(editor)!.injector.get(BrnDialogRef)
    await s.clickDialog("Cancelar")
    expect(dialogRef.open).toBe(false)
    editor
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await s.settle()
    expect(s.update).toHaveBeenCalledTimes(1)
    expect(s.success).not.toHaveBeenCalled()
  })

  it.each(["route", "logout", "replacement", "destruction"])(
    "cancels pending write synchronously and fences feedback on %s",
    async change => {
      const s = await editSetup()
      await s.open()
      await s.catalogs()
      await s.submit()
      expect(s.writeResponse.observed).toBe(true)
      if (change === "route") await s.harness.navigateByUrl("/admin/customers/leads/8")
      else if (change === "destruction") s.harness.fixture.destroy()
      else
        s.session.next(
          change === "logout"
            ? null
            : AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8)
        )
      expect(s.writeResponse.observed).toBe(false)
      s.writeResponse.next(Result.success(lead()))
      if (change !== "destruction") await s.settle()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.update).toHaveBeenCalledTimes(1)
      if (change === "route") expect(s.element().textContent).not.toContain("Prospecto 7")
    }
  )

  it("cancels catalog reads on route replacement before the new record is loaded", async () => {
    const s = await editSetup()
    await s.open()
    expect(s.origins.observed).toBe(true)
    await s.harness.navigateByUrl("/admin/customers/leads/8")
    expect(s.origins.observed).toBe(false)
    expect(s.stages.observed).toBe(false)
    await s.settle()
    expect(s.element().textContent).not.toContain("Editar prospecto")
  })

  it("preserves same-session renewal and fences post-Result route changes", async () => {
    const s = await editSetup()
    await s.open()
    await s.catalogs()
    await s.fill("name", "Borrador")
    const current = s.session.value!
    s.session.next(
      AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
    )
    await s.settle()
    expect(s.dialog().querySelector<HTMLInputElement>("#lead-name")!.value).toBe("Borrador")
    await s.submit()
    expect(s.writeResponse.observed).toBe(true)
    s.writeResponse.next(Result.success(lead()))
    s.session.next(null)
    await s.settle()
    expect(s.success).not.toHaveBeenCalled()
  })

  it.each(["escape", "backdrop", "outside"])(
    "fences closing-animation submission after idle %s",
    async dismissal => {
      const s = await editSetup()
      await s.open()
      await s.catalogs()
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
      expect(s.update).not.toHaveBeenCalled()
      expect(s.success).not.toHaveBeenCalled()
    }
  )

  it("keeps pending edits through same-session renewal and confirms success normally", async () => {
    const s = await editSetup()
    await s.open()
    await s.catalogs()
    await s.submit()
    const current = s.session.value!
    s.session.next(
      AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
    )
    expect(s.writeResponse.observed).toBe(true)
    s.writeResponse.next(Result.success(lead()))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Prospecto actualizado correctamente.")
    expect(s.execute).toHaveBeenCalledTimes(2)
  })

  it("hides mismatched unverified detail and never offers an editor for it", async () => {
    const s = await editSetup()
    await s.respond(Result.success(lead(8)))
    expect(s.element().textContent).not.toContain("Editar prospecto")
    expect(s.element().textContent).not.toContain("Prospecto 8")
    expect(s.readOrigins).not.toHaveBeenCalled()
    expect(s.update).not.toHaveBeenCalled()
  })

  it("does not expose edit or dispatch catalogs/writes in SSR", async () => {
    const s = await editSetup(true)
    expect(s.element().textContent).not.toContain("Editar prospecto")
    expect(s.update).not.toHaveBeenCalled()
    expect(s.readOrigins).not.toHaveBeenCalled()
    expect(s.readStages).not.toHaveBeenCalled()
  })
})
