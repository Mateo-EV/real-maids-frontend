import { PLATFORM_ID } from "@angular/core"
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

async function setup(url = "/admin/customers/leads/7", server = false) {
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
      { provide: ListCustomersUseCase, useValue: { execute: customers } },
      ...[
        Actions.ListLeadOriginsUseCase,
        Actions.ListFunnelStagesUseCase,
        Actions.ListLeadFollowUpsUseCase,
        Actions.ConvertLeadUseCase,
        Actions.CreateLeadUseCase,
        Actions.UpdateLeadUseCase
      ].map(provide => ({ provide, useValue: { execute: forbiddenAction } })),
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const harness = await RouterTestingHarness.create(url)
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
    customers
  }
}
afterEach(() => vi.restoreAllMocks())

describe("Lead read-only detail and independent return context", () => {
  it("loads only the selected lead, shows provided UTC/null/plain text fields without synthetic customer linkage", async () => {
    const s = await setup()
    expect(s.execute).toHaveBeenCalledExactlyOnceWith(7)
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
    expect(s.element().textContent).not.toMatch(
      /Cliente vinculado|Editar|Convertir|Seguimiento|Crear/
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
    expect(s.forbiddenAction).not.toHaveBeenCalled()
  })
})
