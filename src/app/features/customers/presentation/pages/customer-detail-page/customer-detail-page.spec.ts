import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { BehaviorSubject, Subject, of } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { Result } from "@/app/shared/utils/result"
import { CUSTOMERS_ROUTES } from "../../../customers.routes"
import { customerFixture } from "../../../domain/customer.fixture"
import { Customer } from "../../../domain/entities/customer.entity"
import { Property } from "../../../domain/entities/property.entity"
import { CustomerError } from "../../../domain/errors/customer.error"
import { GetCustomerByIdUseCase } from "../../../application/use-cases/get-customer-by-id.use-case"
import { ListCustomersUseCase } from "../../../application/use-cases/list-customers.use-case"
import {
  CreatePropertyUseCase,
  ListCustomerPropertiesUseCase,
  SetPropertyStatusUseCase,
  UpdatePropertyUseCase
} from "../../../application/use-cases/property.use-cases"
import { CustomersStore } from "../../state/customers.store"

const customer = customerFixture(7, "Cliente siete")
const property = Property.create(
  3,
  7,
  "Casa",
  "Calle de prueba",
  null,
  "Región",
  null,
  "123.40",
  null,
  0,
  "Acceso de prueba",
  "Código ficticio",
  true,
  false,
  new Date("2026-01-01T00:00:00Z")
)
type CustomerResult = Result<Customer, CustomerError>
type PropertyResult = Result<readonly Property[], CustomerError>
async function setup(url = "/admin/customers/7", server = false) {
  const customers: Subject<CustomerResult>[] = [],
    properties: Subject<PropertyResult>[] = []
  const get = vi.fn(() => {
    const request = new Subject<CustomerResult>()
    customers.push(request)
    return request
  })
  const listProperties = vi.fn(() => {
    const request = new Subject<PropertyResult>()
    properties.push(request)
    return request
  })
  const list = vi.fn(() =>
    of(Result.success({ items: [customer], total: 50, offset: 10, limit: 5 }))
  )
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
      { provide: GetCustomerByIdUseCase, useValue: { execute: get } },
      { provide: ListCustomersUseCase, useValue: { execute: list } },
      { provide: ListCustomerPropertiesUseCase, useValue: { execute: listProperties } },
      ...[CreatePropertyUseCase, UpdatePropertyUseCase, SetPropertyStatusUseCase].map(provide => ({
        provide,
        useValue: { execute: vi.fn() }
      })),
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const harness = await RouterTestingHarness.create(url)
  const settle = async () => {
    harness.detectChanges()
    await harness.fixture.whenStable()
    harness.detectChanges()
  }
  const respondCustomer = async (
    value: CustomerResult = Result.success(customer),
    index = customers.length - 1
  ) => {
    customers[index].next(value)
    customers[index].complete()
    await settle()
  }
  const respondProperties = async (value: PropertyResult = Result.success([property])) => {
    properties.at(-1)!.next(value)
    properties.at(-1)!.complete()
    await settle()
  }
  const element = () => harness.routeNativeElement!
  const click = async (text: string) => {
    const button = [...element().querySelectorAll("button")].find(
      b => b.textContent?.trim() === text
    )!
    expect(button).toBeDefined()
    button.click()
    await settle()
  }
  await settle()
  return {
    harness,
    settle,
    get,
    list,
    listProperties,
    customers,
    properties,
    session,
    respondCustomer,
    respondProperties,
    element,
    click
  }
}
afterEach(() => vi.restoreAllMocks())

describe("Customer read-only detail", () => {
  it.each(["0", "-1", "1.5", "2147483648", "NaN", "1e2", "abc"])(
    "rejects invalid ID %s without any data read",
    async id => {
      const s = await setup(`/admin/customers/${id}`)
      expect(s.get).not.toHaveBeenCalled()
      expect(s.listProperties).not.toHaveBeenCalled()
      expect(s.list).not.toHaveBeenCalled()
      expect(s.element().textContent).toContain("identificador del cliente no es válido")
      expect(s.element().querySelector("a")?.getAttribute("href")).toBe(
        "/admin/customers?offset=0&limit=20"
      )
    }
  )
  it("separates customer failure/retry from properties and never claims empty before success", async () => {
    const s = await setup()
    expect(s.element().textContent).toContain("Cargando cliente")
    expect(s.listProperties).not.toHaveBeenCalled()
    await s.respondCustomer(Result.failure(new CustomerError("CUSTOMER_NOT_FOUND")))
    expect(s.element().textContent).toContain("Puede no existir")
    expect(s.listProperties).not.toHaveBeenCalled()
    await s.click("Reintentar cliente")
    await s.respondCustomer()
    expect(s.element().textContent).toContain(customer.name)
    expect(s.element().textContent).toContain("Cargando propiedades")
    expect(s.element().textContent).not.toContain("No hay propiedades")
    await s.respondProperties(Result.failure(new CustomerError("FORBIDDEN")))
    expect(s.element().textContent).toContain("No se pudieron consultar las propiedades")
    expect(s.element().textContent).not.toContain("No hay propiedades")
    await s.click("Reintentar propiedades")
    await s.respondProperties(Result.success([]))
    expect(s.element().textContent).toContain("No hay propiedades registradas")
    expect(s.get).toHaveBeenCalledTimes(2)
  })
  it("includes inactive owner properties, canonical area/null/zero and disclosure-only supplied access fields", async () => {
    const s = await setup()
    const inactive = Customer.create(
      customer.id,
      customer.name,
      null,
      customer.type,
      null,
      null,
      null,
      null,
      null,
      false,
      customer.createdAt,
      null,
      null,
      null
    )
    await s.respondCustomer(Result.success(inactive))
    await s.respondProperties()
    expect(s.element().textContent).toContain("Inactivo")
    const details = s.element().querySelector("details")!
    expect(details.open).toBe(false)
    expect(details.querySelector("summary")?.textContent).toContain("Inactiva")
    expect(s.element().textContent).not.toContain(property.accessInstructions)
    expect(s.element().textContent).not.toContain(property.doorCode)
    details.open = true
    details.dispatchEvent(new Event("toggle"))
    await s.settle()
    expect(details.textContent).toContain("123.40 m²")
    expect(details.textContent).toContain("No registrado")
    expect(details.textContent).toContain("Baños0")
    expect(details.textContent).toContain(property.accessInstructions)
    expect(details.textContent).toContain(property.doorCode)
    expect(details.querySelector("summary")?.textContent).not.toContain(property.doorCode)
    expect(TestBed.inject(Router).url).not.toContain(property.doorCode)
    expect(document.querySelector("hot-toast-container")).toBeNull()
    details.open = false
    details.dispatchEvent(new Event("toggle"))
    await s.settle()
    expect(s.element().textContent).not.toContain(property.doorCode)
  })
  it("keeps verified same-owner profile/properties on refresh failure with independent retries", async () => {
    const s = await setup()
    await s.respondCustomer()
    await s.respondProperties()
    TestBed.inject(CustomersStore).invalidateCustomers(7)
    await s.settle()
    expect(s.element().textContent).toContain("Actualizando cliente")
    expect(s.element().textContent).toContain("Casa")
    await s.respondCustomer(Result.failure(new CustomerError("NETWORK")))
    expect(s.element().textContent).toContain(customer.name)
    expect(s.element().textContent).toContain("desactualizados")
    await s.click("Reintentar cliente")
    await s.respondCustomer()
    expect(s.listProperties).toHaveBeenCalledTimes(1)
    // A public forced store read shares the same owner projection used by the page.
    const { CustomerPropertiesStore } = await import("../../state/customer-properties.store")
    const sub = TestBed.inject(CustomerPropertiesStore).loadProperties(7, true).subscribe()
    await s.settle()
    expect(s.element().textContent).toContain("Actualizando propiedades")
    await s.respondProperties(Result.failure(new CustomerError("NETWORK")))
    expect(s.element().textContent).toContain("Casa")
    await s.click("Reintentar propiedades")
    await s.respondProperties()
    sub.unsubscribe()
    expect(s.listProperties).toHaveBeenCalledTimes(3)
  })
  it("cancels old owner work and destruction, hides cross-owner data and ignores late completions", async () => {
    const s = await setup()
    await s.respondCustomer()
    const old = s.properties[0]
    await s.harness.navigateByUrl("/admin/customers/8")
    await s.settle()
    expect(old.observed).toBe(false)
    expect(s.element().textContent).not.toContain(customer.name)
    old.next(Result.success([property]))
    await s.settle()
    expect(s.element().textContent).not.toContain("Casa")
    expect(s.get).toHaveBeenLastCalledWith(8)
    s.harness.fixture.destroy()
    expect(s.customers.at(-1)!.observed).toBe(false)
  })
  it("preserves same-session renewal but clears and cancels on replacement", async () => {
    const s = await setup()
    await s.respondCustomer()
    const current = s.session.value!
    s.session.next(
      AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
    )
    await s.settle()
    expect(s.element().textContent).toContain(customer.name)
    expect(s.properties[0].observed).toBe(true)
    s.session.next(AuthSession.create("Other", "other@example.test", null, current.expiresAt, 8))
    await s.settle()
    expect(s.properties[0].observed).toBe(false)
    expect(s.element().textContent).not.toContain(customer.name)
    s.properties[0].next(Result.success([property]))
    await s.settle()
    expect(s.element().textContent).not.toContain("Casa")
  })
  it("navigates desktop/mobile list -> detail -> back using effective returned metadata, not the request", async () => {
    const s = await setup("/admin/customers?offset=40&limit=20")
    expect(s.list).toHaveBeenCalledExactlyOnceWith({ offset: 40, limit: 20 })
    const links = [
      ...s
        .element()
        .querySelectorAll<HTMLAnchorElement>('a[aria-label="Ver detalle de Cliente siete"]')
    ]
    expect(links).toHaveLength(2)
    expect(links.map(a => a.getAttribute("href"))).toEqual(
      Array(2).fill("/admin/customers/7?offset=10&limit=5")
    )
    links[0].click()
    await s.settle()
    await s.respondCustomer()
    await s.respondProperties(Result.success([]))
    const back = s.element().querySelector<HTMLAnchorElement>("a")!
    expect(back.getAttribute("href")).toBe("/admin/customers?offset=10&limit=5")
    back.click()
    await s.settle()
    expect(s.list).toHaveBeenLastCalledWith({ offset: 10, limit: 5 })
  })
  it("omits redacted access fields even when opened and falls back for duplicate paging values", async () => {
    const s = await setup("/admin/customers/7?offset=10&offset=20&limit=5")
    await s.respondCustomer()
    const redacted = Property.create(
      4,
      7,
      null,
      "Dirección",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      false,
      true,
      property.createdAt
    )
    await s.respondProperties(Result.success([redacted]))
    const details = s.element().querySelector("details")!
    details.open = true
    details.dispatchEvent(new Event("toggle"))
    await s.settle()
    expect(details.textContent).not.toContain("Código de acceso")
    expect(details.textContent).not.toContain("Instrucciones de acceso")
    expect(details.textContent).not.toContain("m²")
    expect(s.element().querySelector("a")?.getAttribute("href")).toBe(
      "/admin/customers?offset=0&limit=20"
    )
  })

  it("cancels pending customer reads on logout before any property read", async () => {
    const s = await setup()
    s.session.next(null)
    await s.settle()
    expect(s.customers[0].observed).toBe(false)
    s.customers[0].next(Result.success(customer))
    await s.settle()
    expect(s.listProperties).not.toHaveBeenCalled()
    expect(s.element().textContent).not.toContain(customer.name)
  })

  it("does not dispatch detail or property reads during SSR", async () => {
    const s = await setup("/admin/customers/7", true)
    expect(s.get).not.toHaveBeenCalled()
    expect(s.listProperties).not.toHaveBeenCalled()
  })
})
