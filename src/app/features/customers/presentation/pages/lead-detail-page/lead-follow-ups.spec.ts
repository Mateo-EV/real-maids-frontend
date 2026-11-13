import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, of, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { CUSTOMERS_ROUTES } from "../../../customers.routes"
import * as Actions from "../../../application/use-cases/acquisition.use-cases"
import { Lead } from "../../../domain/entities/lead.entity"
import { LeadFollowUp } from "../../../domain/entities/lead-follow-up.entity"
import { GetCustomerStatisticsUseCase } from "../../../application/use-cases/get-customer-statistics.use-case"
import { CustomerError } from "../../../domain/errors/customer.error"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"

type Read = Result<readonly LeadFollowUp[], CustomerError>
const lead = (id = 7) =>
  Lead.create(id, 11, 12, `Prospecto ${id}`, null, null, null, null, false, new Date(0), null)
const rows = (owner = 7) => [
  LeadFollowUp.create(
    9,
    owner,
    21,
    31,
    "<b>Comentario literal</b>\nhttps://example.test",
    new Date("2026-01-02T12:30:00Z")
  ),
  LeadFollowUp.create(3, owner, 22, 32, null, new Date(0)),
  LeadFollowUp.create(5, owner, 23, 33, "", new Date(1))
]
async function setup(server = false, url = "/admin/customers/leads/7?offset=10&limit=5") {
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "test@example.test", null, Date.now() + 600000, 7)
  )
  const profiles: Subject<Result<Lead, CustomerError>>[] = [],
    requests: Subject<Read>[] = []
  const profile = vi.fn(() => {
    const r = new Subject<Result<Lead, CustomerError>>()
    profiles.push(r)
    return r
  })
  const read = vi.fn(() => {
    const r = new Subject<Read>()
    requests.push(r)
    return r
  })
  const unexpected = vi.fn(() => {
    throw new Error("Unexpected catalog/write/lookup")
  })
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
        Actions.ListFunnelStagesUseCase,
        Actions.ListLeadsUseCase,
        Actions.ConvertLeadUseCase,
        Actions.AddLeadFollowUpUseCase,
        Actions.CreateLeadUseCase,
        Actions.UpdateLeadUseCase
      ].map(provide => ({ provide, useValue: { execute: unexpected } })),
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const harness = await RouterTestingHarness.create(url)
  // The routed parent is the CRM shell (navigation + KPIs): keep every assertion on the detail consumer.
  const root = () => harness.routeNativeElement!.querySelector<HTMLElement>("app-lead-detail-page")!
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  const loaded = async (id = 7) => {
    profiles.at(-1)!.next(Result.success(lead(id)))
    profiles.at(-1)!.complete()
    await settle()
  }
  const disclosure = () => root().querySelector<HTMLDetailsElement>("details")!
  const panel = () => root().querySelector("app-lead-follow-ups")!
  const toggle = async (open: boolean) => {
    expect(disclosure(), "Seguimientos disclosure").not.toBeNull()
    disclosure().open = open
    disclosure().dispatchEvent(new Event("toggle"))
    await settle()
  }
  const respond = async (result: Read) => {
    requests.at(-1)!.next(result)
    requests.at(-1)!.complete()
    await settle()
  }
  const retry = async () => {
    const button = [...panel().querySelectorAll<HTMLButtonElement>("button")].find(
      button => button.textContent?.trim() === "Reintentar seguimientos"
    )!
    expect(button).not.toBeNull()
    button.click()
    await settle()
  }
  await settle()
  return {
    harness,
    root,
    settle,
    loaded,
    disclosure,
    panel,
    toggle,
    respond,
    retry,
    read,
    profile,
    profiles,
    requests,
    session,
    unexpected
  }
}
afterEach(() => vi.restoreAllMocks())

describe("T4 on-demand read-only follow-ups with real root store", () => {
  it("mounts only after opening verified matching detail; renders supplied plain/UTC/null fields in server order on both layouts", async () => {
    const s = await setup()
    expect(s.disclosure()).toBeNull()
    expect(s.read).not.toHaveBeenCalled()
    await s.loaded()
    expect(s.disclosure().open).toBe(false)
    expect(s.panel()).toBeNull()
    expect(s.read).not.toHaveBeenCalled()
    await s.toggle(true)
    expect(s.read).toHaveBeenCalledExactlyOnceWith(7)
    expect(s.panel().textContent).toContain("Cargando seguimientos")
    expect(s.panel().textContent).not.toContain("No se devolvieron")
    await s.respond(Result.success(rows()))
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const layout = s.panel().querySelector(selector)!
      expect(layout.textContent).toContain("<b>Comentario literal</b>")
      expect(layout.textContent).toContain("2026-01-02T12:30:00.000Z")
      expect(layout.textContent).toContain("No registrado")
      expect(layout.textContent).toContain("21")
      expect(layout.textContent).toContain("31")
      expect(
        [...layout.querySelectorAll("[data-follow-up-id]")].map(e =>
          e.getAttribute("data-follow-up-id")
        )
      ).toEqual(["9", "3", "5"])
      expect(layout.querySelectorAll("[data-comment]")[2].textContent?.trim()).toBe("")
    }
    expect(s.panel().querySelector("b, a, input, select")).toBeNull()
    expect(s.panel().textContent).not.toMatch(/Añadir|Convertir/)
    expect(s.root().querySelector("app-catalog-frame header")?.textContent).toContain(
      "Convertir a cliente"
    )
    expect(s.panel().textContent).toContain("Registrar seguimiento")
    expect(s.root().textContent).toContain("Editar prospecto")
    expect(s.root().querySelector("a")?.getAttribute("href")).toBe(
      "/admin/customers/leads?offset=10&limit=5"
    )
    expect(s.profile).toHaveBeenCalledTimes(1)
    expect(s.unexpected).not.toHaveBeenCalled()
  })
  it("destroys on close, reuses fresh success and revalidates at exact TTL without polling or extending freshness on failed reads", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    await s.loaded()
    await s.toggle(true)
    await s.respond(Result.success(rows()))
    await s.toggle(false)
    expect(s.panel()).toBeNull()
    clock.mockReturnValue(30999)
    await s.toggle(true)
    expect(s.read).toHaveBeenCalledTimes(1)
    await s.toggle(false)
    clock.mockReturnValue(31000)
    expect(s.read).toHaveBeenCalledTimes(1)
    await s.toggle(true)
    expect(s.read).toHaveBeenCalledTimes(2)
    expect(s.panel().textContent).toContain("Actualizando seguimientos")
    expect(s.panel().textContent).toContain("Comentario literal")
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.panel().textContent).toContain("desactualizados")
    expect(s.panel().textContent).toContain("Comentario literal")
    await s.toggle(false)
    await s.toggle(true)
    expect(s.read).toHaveBeenCalledTimes(3)
    await s.respond(Result.success([]))
    expect(s.panel().textContent).toContain("No se devolvieron seguimientos")
    expect(s.panel().textContent).not.toContain("Comentario literal")
  })
  it.each(["FORBIDDEN", "NETWORK", "INVALID_RESPONSE", "UNAUTHENTICATED"] as const)(
    "keeps %s failure independent of profile/edit and forces explicit retry, never false empty",
    async code => {
      const s = await setup()
      await s.loaded()
      await s.toggle(true)
      await s.respond(Result.failure(new CustomerError(code)))
      expect(s.panel().querySelector('[role="alert"]')).not.toBeNull()
      expect(s.panel().textContent).not.toContain("No se devolvieron")
      expect(s.root().textContent).toContain("Prospecto 7")
      expect(s.root().textContent).toContain("Editar prospecto")
      await s.retry()
      expect(s.read).toHaveBeenCalledTimes(2)
      await s.respond(Result.success(rows()))
      expect(s.panel().querySelector('[role="alert"]')).toBeNull()
      expect(s.profile).toHaveBeenCalledTimes(1)
    }
  )
  it("treats empty completion as failure and allows retry", async () => {
    const s = await setup()
    await s.loaded()
    await s.toggle(true)
    s.requests[0].complete()
    await s.settle()
    expect(s.panel().querySelector('[role="alert"]')).not.toBeNull()
    await s.retry()
    expect(s.read).toHaveBeenCalledTimes(2)
  })
  it("retries a stale failure explicitly and preserves verified rows while pending", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    await s.loaded()
    await s.toggle(true)
    await s.respond(Result.success(rows()))
    await s.toggle(false)
    clock.mockReturnValue(31000)
    await s.toggle(true)
    await s.respond(Result.failure(new CustomerError("FORBIDDEN")))
    await s.retry()
    expect(s.read).toHaveBeenCalledTimes(3)
    expect(s.panel().textContent).toContain("Actualizando seguimientos")
    expect(s.panel().textContent).toContain("Comentario literal")
    await s.respond(Result.success([]))
    expect(s.panel().textContent).not.toContain("desactualizados")
  })
  it("releases only its subscriber on close and cancels the final reader", async () => {
    const s = await setup()
    await s.loaded()
    const other = TestBed.inject(CustomerAcquisitionStore).observeFollowUps(7).subscribe()
    await s.toggle(true)
    expect(s.read).toHaveBeenCalledTimes(1)
    await s.toggle(false)
    expect(s.requests[0].observed).toBe(true)
    await s.toggle(true)
    expect(s.read).toHaveBeenCalledTimes(1)
    other.unsubscribe()
    expect(s.requests[0].observed).toBe(true)
    await s.toggle(false)
    expect(s.requests[0].observed).toBe(false)
    await s.toggle(true)
    expect(s.read).toHaveBeenCalledTimes(2)
    s.harness.fixture.destroy()
    expect(s.requests[1].observed).toBe(false)
  })
  it("honors actual native closed state for queued toggles and fences detached owner events", async () => {
    const s = await setup()
    await s.loaded()
    const old = s.disclosure()
    old.open = true
    old.open = false
    old.dispatchEvent(new Event("toggle"))
    await s.settle()
    expect(s.read).not.toHaveBeenCalled()
    expect(s.panel()).toBeNull()
    await s.toggle(true)
    const pending = s.requests[0]
    await s.harness.navigateByUrl("/admin/customers/leads/8")
    expect(pending.observed).toBe(false)
    old.open = true
    old.dispatchEvent(new Event("toggle"))
    await s.settle()
    pending.next(Result.success(rows()))
    expect(s.panel()).toBeNull()
    expect(s.disclosure()).toBeNull()
    await s.loaded(8)
    expect(s.disclosure().open).toBe(false)
    await s.toggle(true)
    expect(s.read).toHaveBeenLastCalledWith(8)
    expect(s.panel().textContent).not.toContain("Comentario literal")
  })
  it("blocks retry when native close precedes its queued toggle", async () => {
    const s = await setup()
    await s.loaded()
    await s.toggle(true)
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    s.disclosure().open = false
    await s.retry()
    expect(s.read).toHaveBeenCalledTimes(1)
    s.disclosure().dispatchEvent(new Event("toggle"))
    await s.settle()
    expect(s.panel()).toBeNull()
  })
  it.each(["logout", "replacement", "destruction"])(
    "cancels/fences on %s while same-session renewal preserves pending and visible data",
    async change => {
      const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
      const s = await setup()
      await s.loaded()
      await s.toggle(true)
      const current = s.session.value!
      const renew = () =>
        s.session.next(
          AuthSession.create(
            current.name,
            current.email,
            current.role,
            current.expiresAt,
            current.id
          )
        )
      renew()
      await s.settle()
      expect(s.requests[0].observed).toBe(true)
      await s.respond(Result.success(rows()))
      renew()
      await s.settle()
      expect(s.panel().textContent).toContain("Comentario literal")
      await s.toggle(false)
      clock.mockReturnValue(31000)
      await s.toggle(true)
      const pending = s.requests[1]
      if (change === "destruction") s.harness.fixture.destroy()
      else
        s.session.next(
          change === "logout"
            ? null
            : AuthSession.create("Other", "other@example.test", null, current.expiresAt, 8)
        )
      expect(pending.observed).toBe(false)
      pending.next(Result.success(rows()))
      if (change !== "destruction") {
        await s.settle()
        expect(s.panel()).toBeNull()
        expect(s.root().textContent).not.toContain("Comentario literal")
      }
    }
  )
  it.each(["0", "abc", "2147483648"])("does not mount/read for invalid ID %s", async id => {
    const s = await setup(false, `/admin/customers/leads/${id}`)
    expect(s.disclosure()).toBeNull()
    expect(s.read).not.toHaveBeenCalled()
  })
  it("does not mount for mismatched profile or SSR", async () => {
    const s = await setup()
    await s.loaded(8)
    expect(s.disclosure()).toBeNull()
    expect(s.read).not.toHaveBeenCalled()
  })
  it("dispatches no profile/follow-up/catalog work in SSR", async () => {
    const s = await setup(true)
    expect(s.disclosure()).toBeNull()
    expect(s.read).not.toHaveBeenCalled()
    expect(s.profile).not.toHaveBeenCalled()
    expect(s.unexpected).not.toHaveBeenCalled()
  })
})
