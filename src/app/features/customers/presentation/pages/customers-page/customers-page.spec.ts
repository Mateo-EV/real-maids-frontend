import { TestBed } from "@angular/core/testing"
import { PLATFORM_ID } from "@angular/core"
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router"
import { BehaviorSubject, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { ListCustomersUseCase } from "../../../application/use-cases/list-customers.use-case"
import { customerFixture } from "../../../domain/customer.fixture"
import { Customer } from "../../../domain/entities/customer.entity"
import { CustomerError } from "../../../domain/errors/customer.error"
import { CustomersStore } from "../../state/customers.store"
import { CustomersPage } from "./customers-page"

type PageResult = Result<PaginationResponse<Customer>, CustomerError>
const row = customerFixture(7, "Cliente de prueba", "client@example.test", "555 0100")
const page = (items: Customer[] = [row], total = 45, offset = 0, limit = 20): PageResult =>
  Result.success({ items, total, offset, limit })

function setup(server = false, query: Record<string, string | undefined> = {}) {
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
    imports: [CustomersPage],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } }
      },
      { provide: ListCustomersUseCase, useValue: { execute } },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const fixture = TestBed.createComponent(CustomersPage)
  fixture.detectChanges()
  const element = fixture.nativeElement as HTMLElement
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const respond = async (value: PageResult, index = requests.length - 1) => {
    requests[index].next(value)
    requests[index].complete()
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

describe("CustomersPage read-only server list", () => {
  it("restores validated list paging from navigation context before its first read", () => {
    const s = setup(false, { offset: "30", limit: "5" })
    expect(s.execute).toHaveBeenCalledExactlyOnceWith({ offset: 30, limit: 5 })
  })
  it.each([
    { offset: "1", limit: "20" },
    { offset: "-20", limit: "20" },
    { offset: "0", limit: "0" },
    { offset: "0", limit: "2147483648" },
    { offset: "9007199254740992", limit: "1" },
    { offset: "4294967296", limit: "1" },
    { offset: "abc", limit: "5" },
    { offset: "20" },
    { limit: "5" },
    { offset: "0", limit: "1e2" }
  ])("defaults malformed context %o to 0/20 before HTTP", query => {
    const s = setup(false, query)
    expect(s.execute).toHaveBeenCalledExactlyOnceWith({ offset: 0, limit: 20 })
  })
  it("uses the shared catalog hierarchy and container-responsive records", async () => {
    const s = setup()
    await s.respond(page())
    const frame = s.element.querySelector("app-catalog-frame")!
    expect(frame).not.toBeNull()
    const section = frame.querySelector('section[aria-labelledby="customers-title"]')!
    expect(section.getAttribute("aria-busy")).toBe("false")
    expect(section.querySelector("header h1#customers-title")?.textContent).toContain(
      "Catálogo de Clientes"
    )
    expect(section.querySelector("header button")?.textContent).toContain("Crear cliente")
    expect(section.querySelector("[catalogDesktop] table")).not.toBeNull()
    expect(section.querySelector("ul[catalogMobile]")).not.toBeNull()
    expect(section.querySelector("footer app-table-pagination")).not.toBeNull()
  })
  it("requests 0/20 and distinguishes loading from verified empty without future launchers", async () => {
    const s = setup()
    expect(s.execute).toHaveBeenCalledExactlyOnceWith({ offset: 0, limit: 20 })
    expect(s.element.textContent).toContain("Cargando clientes")
    expect(s.element.textContent).not.toContain("No hay clientes activos")
    await s.respond(page([], 0))
    expect(s.element.textContent).toContain("No hay clientes activos")
    expect(s.element.querySelector("input, select")).toBeNull()
    const navigation = s.element.querySelector(
      'app-crm-catalog-navigation nav[aria-label="Catálogos CRM"]'
    )!
    expect(navigation).not.toBeNull()
    expect(navigation.querySelector('a[href="/admin/customers"]')?.textContent).toContain(
      "Clientes"
    )
    expect(navigation.querySelector('a[href="/admin/customers/leads"]')?.textContent).toContain(
      "Prospectos"
    )
    expect(s.element.querySelector("app-catalog-frame a")).toBeNull()
    expect(s.element.textContent).toContain("Crear cliente")
    expect(s.element.textContent).not.toMatch(/Editar|Propiedades|Desactivar/)
    expect(s.element.textContent).not.toContain("Cargando clientes")
  })

  it("renders official fields, actual ranges and effective metadata for next/previous", async () => {
    const s = setup()
    await s.respond(page([row], 45, 0, 5))
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).toContain("Residencial")
    expect(s.element.textContent).toContain(row.email)
    expect(s.element.textContent).toContain(row.phone)
    expect(s.element.textContent).toContain("1–1 de 45")
    expect(
      s.element.querySelector('button[aria-label="Página anterior"]')?.hasAttribute("disabled")
    ).toBe(true)
    await s.click("Página siguiente")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 5, limit: 5 })
    await s.respond(page([row], 45, 2, 2))
    expect(s.element.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe("2")
    expect(s.element.textContent).toContain("3–3 de 45")
    await s.click("Página siguiente")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 4, limit: 2 })
    await s.respond(page([row], 45, 4, 2))
    await s.click("Página anterior")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 2, limit: 2 })
  })

  it("shows retryable safe errors, not false emptiness or raw domain messages", async () => {
    const s = setup()
    await s.respond(Result.failure(new CustomerError("FORBIDDEN")))
    expect(s.element.querySelector('[role="alert"]')?.textContent).toContain("No tienes permiso")
    expect(s.element.textContent).not.toContain("No hay clientes activos")
    await s.click("Reintentar")
    expect(s.execute).toHaveBeenCalledTimes(2)
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 0, limit: 20 })
    await s.respond(page())
    expect(s.element.textContent).toContain(row.name)
  })

  it("retains same-key rows during invalidation refresh and failed forced retry", async () => {
    const s = setup()
    await s.respond(page())
    TestBed.inject(CustomersStore).invalidateCustomers()
    await s.settle()
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).toContain("Actualizando clientes")
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.textContent).toContain("desactualizados")
    expect(s.element.textContent).toContain(row.name)
    await s.click("Reintentar")
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).toContain("Actualizando clientes")
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).toContain("desactualizados")
  })

  it("reuses fresh pages and retains only same-key rows on an expired revisit", async () => {
    const clock = vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = setup()
    await s.respond(page())
    await s.click("Página siguiente")
    await s.respond(page([customerFixture(8, "Otra página")], 45, 20))
    await s.click("Página anterior")
    expect(s.execute).toHaveBeenCalledTimes(2)
    expect(s.element.textContent).toContain(row.name)
    await s.click("Página siguiente")
    clock.mockReturnValue(121001)
    await s.click("Página anterior")
    expect(s.execute).toHaveBeenCalledTimes(3)
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).not.toContain("Otra página")
    expect(s.element.textContent).toContain("Actualizando clientes")
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.textContent).toContain(row.name)
    expect(s.element.textContent).toContain("desactualizados")
  })

  it("hides unrelated rows while a new page loads or fails and retries that page", async () => {
    const s = setup()
    await s.respond(page())
    await s.click("Página siguiente")
    expect(s.element.textContent).not.toContain(row.name)
    await s.respond(Result.failure(new CustomerError("NETWORK")))
    expect(s.element.textContent).not.toContain(row.name)
    await s.click("Reintentar")
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 20, limit: 20 })
  })

  it("corrects a successful out-of-range page once using effective size, never looping", async () => {
    const s = setup()
    await s.respond(page([row], 100))
    await s.click("Página 5")
    await s.respond(page([], 7, 20, 5))
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 5, limit: 5 })
    expect(s.execute).toHaveBeenCalledTimes(3)
    await s.respond(page([], 3, 5, 5))
    expect(s.execute).toHaveBeenCalledTimes(3)
    expect(s.element.textContent).toContain("Esta página ya no tiene registros")
    expect(s.element.textContent).not.toContain("No hay clientes activos")
    await s.click("Reintentar")
    await s.respond(page([], 3, 5, 5))
    expect(s.execute).toHaveBeenLastCalledWith({ offset: 0, limit: 5 })
    expect(s.execute).toHaveBeenCalledTimes(5)
    await s.respond(page([row], 3, 0, 5))
    expect(s.element.textContent).toContain(row.name)
  })

  it("does not correct verified empty catalogs even on a formerly high page", async () => {
    const s = setup()
    await s.respond(page())
    await s.click("Página siguiente")
    await s.respond(page([], 0, 20, 20))
    expect(s.execute).toHaveBeenCalledTimes(2)
    expect(s.element.textContent).toContain("No hay clientes activos")
  })

  it("releases obsolete and destroyed subscriptions, and ignores late responses", async () => {
    const s = setup()
    await s.respond(page())
    TestBed.inject(CustomersStore).invalidateCustomers()
    await s.settle()
    const obsolete = s.requests[1]
    await s.click("Página siguiente")
    expect(obsolete.observed).toBe(false)
    obsolete.next(page([customerFixture(8, "Obsolete")]))
    expect(s.element.textContent).not.toContain("Obsolete")
    expect(s.requests[2].observed).toBe(true)
    s.fixture.destroy()
    expect(s.requests[2].observed).toBe(false)
  })

  it("clears the view and cancels reads on session loss, but not same-session renewal", async () => {
    const s = setup()
    await s.respond(page())
    const current = s.session.value!
    s.session.next(
      AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
    )
    await s.settle()
    expect(s.element.textContent).toContain(row.name)
    TestBed.inject(CustomersStore).invalidateCustomers()
    await s.settle()
    const pending = s.requests[1]
    s.session.next(null)
    await s.settle()
    expect(pending.observed).toBe(false)
    expect(s.element.textContent).not.toContain(row.name)
    pending.next(page())
    await s.settle()
    expect(s.element.textContent).not.toContain(row.name)
  })

  it("does not dispatch customer reads during SSR", () => {
    const s = setup(true)
    expect(s.execute).not.toHaveBeenCalled()
    s.fixture.destroy()
  })
})
