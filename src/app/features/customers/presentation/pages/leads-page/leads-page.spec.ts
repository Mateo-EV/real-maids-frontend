import { PLATFORM_ID } from "@angular/core"
import { HotToastService } from "@ngxpert/hot-toast"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { BehaviorSubject, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { ListLeadsUseCase } from "../../../application/use-cases/acquisition.use-cases"
import { Lead } from "../../../domain/entities/lead.entity"
import { CustomerError } from "../../../domain/errors/customer.error"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"
import { LeadsPage } from "./leads-page"

type PageResult = Result<PaginationResponse<Lead>, CustomerError>
const lead = (id = 7, name = "Prospecto de prueba", converted = false) =>
  Lead.create(
    id,
    11,
    12,
    name,
    "lead@example.test",
    "555 0100",
    null,
    null,
    converted,
    new Date(0),
    null
  )
const row = lead()
const page = (items: Lead[] = [row], total = 45, offset = 0, limit = 20): PageResult =>
  Result.success({ items, total, offset, limit })

function setup(server = false) {
  const requests: Subject<PageResult>[] = []
  const execute = vi.fn(() => {
    const response = new Subject<PageResult>()
    requests.push(response)
    return response
  })
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    imports: [LeadsPage],
    providers: [
      provideRouter([]),
      { provide: HotToastService, useValue: { success: vi.fn() } },
      { provide: ListLeadsUseCase, useValue: { execute } },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const fixture = TestBed.createComponent(LeadsPage)
  fixture.detectChanges()
  const element = fixture.nativeElement as HTMLElement
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const respond = async (value: PageResult) => {
    requests.at(-1)!.next(value)
    requests.at(-1)!.complete()
    await settle()
  }
  const click = async (label: string) => {
    const button = Array.from(element.querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  return { fixture, element, execute, requests, session, respond, click, settle }
}

afterEach(() => vi.restoreAllMocks())

describe("LeadsPage read-only inbox", () => {
  it("starts at 0/20 with unverified loading, then verified empty and shared CRM navigation", async () => {
    const s = setup()
    expect(s.execute).toHaveBeenCalledExactlyOnceWith({ offset: 0, limit: 20 })
    expect(s.element.textContent).toContain("Cargando prospectos")
    expect(s.element.textContent).not.toContain("No hay prospectos")
    await s.respond(page([], 0))
    expect(s.element.textContent).toContain("No hay prospectos")
    expect(s.element.querySelector("app-crm-catalog-navigation")).not.toBeNull()
    expect(s.element.querySelector("input, select, app-catalog-frame a")).toBeNull()
    expect(
      s.element.querySelector("app-catalog-frame header [catalogControls]")?.textContent
    ).toContain("Crear prospecto")
    expect(s.element.textContent).not.toMatch(/Editar|Convertir|Seguimiento|Ver detalle/)
  })

  it("renders actual lead fields and converted state in container-responsive records with working detail links", async () => {
    const s = setup()
    await s.respond(page([row, lead(8, "Convertido real", true)]))
    const frame = s.element.querySelector("app-catalog-frame")!
    expect(
      frame.querySelector('section[aria-labelledby="leads-title"]')?.getAttribute("aria-busy")
    ).toBe("false")
    expect(frame.querySelector("header h1")?.textContent).toContain("Bandeja de Prospectos")
    expect(frame.querySelector("[catalogDesktop] table")).not.toBeNull()
    expect(frame.querySelector("ul[catalogMobile]")).not.toBeNull()
    for (const selector of ["[catalogDesktop]", "[catalogMobile]"]) {
      const records = frame.querySelector(selector)!
      expect(records.textContent).toContain(row.name)
      expect(records.textContent).toContain(row.email)
      expect(records.textContent).toContain(row.phone)
      expect(records.textContent).toContain("Convertido")
      expect(records.textContent).toContain("No convertido")
      expect(records.textContent).toContain("11")
      expect(records.textContent).toContain("12")
      expect(records.querySelectorAll("a")).toHaveLength(2)
      expect(records.querySelector("a")?.getAttribute("href")).toBe(
        "/admin/customers/leads/7?offset=0&limit=20"
      )
      expect(records.querySelector("button")).toBeNull()
    }
    expect(frame.querySelector("th")?.textContent).toBe("Nombre")
    expect(frame.textContent).toContain("Origen (ID)")
    expect(frame.textContent).toContain("Etapa (ID)")
    expect(frame.textContent).not.toContain("Cliente vinculado")
  })

  it("preserves null contacts as unregistered without fabricating metadata or interpreting text", async () => {
    const s = setup()
    const value = Lead.create(
      9,
      31,
      42,
      "<b>Nombre literal</b>",
      null,
      null,
      null,
      null,
      false,
      new Date(0),
      null
    )
    await s.respond(page([value]))
    expect(s.element.textContent).toContain("<b>Nombre literal</b>")
    expect(s.element.querySelector("b")).toBeNull()
    expect(s.element.querySelector("[catalogDesktop]")?.textContent).toContain("No registrado")
    expect(s.element.querySelector("[catalogMobile]")?.textContent).toContain("No registrado")
    expect(s.element.textContent).not.toContain("Cliente vinculado")
    expect(s.execute).toHaveBeenCalledTimes(1)
  })

  it("uses effective offset/limit, server total and ranges for next/previous, not local slicing", async () => {
    const s = setup()
    await s.respond(page([row], 45, 0, 5))
    expect(s.element.textContent).toContain("1–1 de 45 prospectos")
    expect(
      s.element.querySelector<HTMLButtonElement>('button[aria-label="Página anterior"]')!.disabled
    ).toBe(true)
    await s.click("Página siguiente")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 5, limit: 5 })
    await s.respond(page([row], 45, 2, 2))
    expect(s.element.textContent).toContain("3–3 de 45 prospectos")
    expect(s.element.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe("2")
    await s.click("Página siguiente")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 4, limit: 2 })
    await s.respond(page([row], 45, 4, 2))
    await s.click("Página anterior")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 2, limit: 2 })
  })

  it("shows safe retryable errors without false empty, and retries the failed query", async () => {
    const s = setup()
    await s.respond(Result.failure(new CustomerError("FORBIDDEN")))
    expect(s.element.querySelector('[role="alert"]')?.textContent).toContain("No tienes permiso")
    expect(s.element.textContent).not.toContain("No hay prospectos")
    await s.click("Reintentar")
    expect(s.execute).toHaveBeenCalledTimes(2)
    await s.respond(page())
    await s.click("Página siguiente")
    expect(s.element.textContent).not.toContain(row.name)
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.textContent).not.toContain(row.name)
    await s.click("Reintentar")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 20, limit: 20 })
  })

  it("reuses fresh pages, keeps only same-query stale rows on expired revisit and failed retries", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = setup()
    await s.respond(page())
    await s.click("Página siguiente")
    await s.respond(page([lead(8, "Otra página")], 45, 20))
    await s.click("Página anterior")
    expect(s.execute).toHaveBeenCalledTimes(2)
    await s.click("Página siguiente")
    clock.mockReturnValue(31000)
    await s.click("Página anterior")
    expect(s.execute).toHaveBeenCalledTimes(3)
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).not.toContain("Otra página")
    expect(s.element.textContent).toContain("Actualizando prospectos")
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.textContent).toContain("desactualizados")
    await s.click("Reintentar")
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).toContain("Actualizando prospectos")
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).toContain("desactualizados")
  })

  it("corrects positive-total out-of-range emptiness once per navigation/retry with the effective limit", async () => {
    const s = setup()
    await s.respond(page([row], 100))
    await s.click("Página 5")
    await s.respond(page([], 7, 20, 5))
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 5, limit: 5 })
    expect(s.execute).toHaveBeenCalledTimes(3)
    await s.respond(page([], 3, 5, 5))
    expect(s.execute).toHaveBeenCalledTimes(3)
    expect(s.element.textContent).toContain("Esta página ya no tiene registros")
    expect(s.element.textContent).not.toContain("No hay prospectos")
    await s.click("Reintentar")
    await s.respond(page([], 3, 5, 5))
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 0, limit: 5 })
    expect(s.execute).toHaveBeenCalledTimes(5)
  })

  it("does not recover verified zero-total pages", async () => {
    const s = setup()
    await s.respond(page())
    await s.click("Página siguiente")
    await s.respond(page([], 0, 20))
    expect(s.execute).toHaveBeenCalledTimes(2)
    expect(s.element.textContent).toContain("No hay prospectos")
  })

  it("shares the root read with another consumer and releases only its own subscription on destruction", () => {
    const s = setup()
    const other = TestBed.inject(CustomerAcquisitionStore)
      .observeLeads({ offset: 0, limit: 20 })
      .subscribe()
    expect(s.execute).toHaveBeenCalledTimes(1)
    s.fixture.destroy()
    expect(s.requests[0].observed).toBe(true)
    other.unsubscribe()
    expect(s.requests[0].observed).toBe(false)
  })

  it("cancels obsolete queries and ignores late results on destruction", async () => {
    const s = setup()
    await s.respond(page())
    await s.click("Página siguiente")
    const pending = s.requests[1]
    s.fixture.destroy()
    expect(pending.observed).toBe(false)
    pending.next(page([lead(9, "Obsoleto")]))
    expect(
      TestBed.inject(CustomerAcquisitionStore).selectLeads({ offset: 20, limit: 20 })().data
    ).toBeUndefined()
  })

  it.each(["logout", "replacement"])(
    "clears and fences pending reads on %s, preserving same-session renewal",
    async change => {
      const s = setup()
      await s.respond(page())
      const current = s.session.value!
      s.session.next(
        AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
      )
      await s.settle()
      expect(s.element.textContent).toContain(row.name)
      await s.click("Página siguiente")
      const pending = s.requests[1]
      s.session.next(
        change === "logout"
          ? null
          : AuthSession.create("Other", "other@example.test", null, current.expiresAt, 8)
      )
      await s.settle()
      expect(pending.observed).toBe(false)
      pending.next(page())
      await s.settle()
      expect(s.element.textContent).not.toContain(row.name)
      expect(s.execute).toHaveBeenCalledTimes(2)
    }
  )

  it("fences a queued recovery if the session changes before its microtask", async () => {
    const s = setup()
    s.requests[0].next(page([], 7, 20, 5))
    s.requests[0].complete()
    s.session.next(AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8))
    await s.settle()
    expect(s.execute).toHaveBeenCalledTimes(1)
  })

  it("cancels an expired background read when navigating to another query", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = setup()
    await s.respond(page())
    await s.click("Página siguiente")
    await s.respond(page([lead(8, "Otra página")], 45, 20))
    clock.mockReturnValue(31000)
    await s.click("Página anterior")
    const obsolete = s.requests[2]
    expect(obsolete.observed).toBe(true)
    await s.click("Página siguiente")
    expect(obsolete.observed).toBe(false)
    obsolete.next(page([lead(9, "Respuesta obsoleta")]))
    await s.settle()
    expect(s.element.textContent).toContain("Otra página")
    expect(s.element.textContent).not.toContain("Respuesta obsoleta")
  })

  it("does not run queued recovery after destruction", async () => {
    const s = setup()
    s.requests[0].next(page([], 7, 20, 5))
    s.fixture.destroy()
    await Promise.resolve()
    expect(s.execute).toHaveBeenCalledTimes(1)
  })

  it("does not dispatch reads during SSR", () => {
    const s = setup(true)
    expect(s.execute).not.toHaveBeenCalled()
  })
})
