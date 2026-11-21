import { TestBed } from "@angular/core/testing"
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router"
import { BehaviorSubject, of, Subject } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HotToastService } from "@ngxpert/hot-toast"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { CreateCustomerParams, UpdateCustomerParams } from "../../../domain/params/customer.params"
import { Customer, CustomerType } from "../../../domain/entities/customer.entity"
import { CustomerError, CustomerErrorCode } from "../../../domain/errors/customer.error"
import { ListCustomersUseCase } from "../../../application/use-cases/list-customers.use-case"
import { CreateCustomerUseCase } from "../../../application/use-cases/create-customer.use-case"
import { UpdateCustomerUseCase } from "../../../application/use-cases/update-customer.use-case"
import { CustomerHistoryStore } from "../../state/customer-history.store"
import { CustomersPage } from "../../pages/customers-page/customers-page"

/** `accountActive`: null = no account, true = active account, false = deactivated account. */
const record = (accountActive: boolean | null, userId: number | null = null) =>
  Customer.create(
    7,
    "Ana",
    userId,
    CustomerType.RESIDENTIAL,
    "ana@example.test",
    null,
    null,
    null,
    null,
    true,
    new Date("2026-01-01T00:00:00Z"),
    null,
    null,
    null,
    accountActive
  )

async function setup(target: Customer | null = null) {
  const response = new Subject<Result<Customer, CustomerError>>()
  const create = vi.fn((_params: CreateCustomerParams) => response)
  const update = vi.fn((_params: UpdateCustomerParams) => response)
  const success = vi.fn()
  const list = vi.fn(() =>
    of(
      Result.success({ items: target ? [target] : [], total: target ? 1 : 0, offset: 0, limit: 20 })
    )
  )
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    imports: [CustomersPage],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: of(convertToParamMap({})),
          queryParamMap: of(convertToParamMap({})),
          snapshot: { queryParamMap: convertToParamMap({}) }
        }
      },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      { provide: HotToastService, useValue: { success } },
      { provide: ListCustomersUseCase, useValue: { execute: list } },
      { provide: CreateCustomerUseCase, useValue: { execute: create } },
      { provide: UpdateCustomerUseCase, useValue: { execute: update } },
      { provide: CustomerHistoryStore, useValue: { invalidateCustomer: vi.fn() } }
    ]
  })
  const fixture = TestBed.createComponent(CustomersPage),
    page = fixture.componentInstance
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const dialog = () => document.querySelector<HTMLElement>("app-customer-editor")!
  const control = <T extends HTMLElement>(selector: string) => dialog().querySelector<T>(selector)!
  const fill = async (selector: string, value: string) => {
    const input = control<HTMLInputElement>(selector)
    input.value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("blur"))
    await settle()
  }
  const toggleAccount = async () => {
    control<HTMLInputElement>("#customer-create-account").click()
    await settle()
  }
  const submit = async () => {
    dialog()
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  const click = async (label: string) => {
    const button = [...dialog().querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const openCreate = async () => {
    page.edit(null)
    await settle()
  }
  const openEdit = async (customer: Customer) => {
    page.edit(customer)
    await settle()
  }
  await settle()
  return {
    fixture,
    page,
    settle,
    dialog,
    control,
    fill,
    toggleAccount,
    submit,
    click,
    openCreate,
    openEdit,
    create,
    update,
    response,
    success
  }
}

beforeEach(() => {
  document.querySelectorAll("app-customer-editor").forEach(element => {
    element.closest(".cdk-overlay-container")?.remove()
  })
})
afterEach(() => {
  vi.restoreAllMocks()
  document.querySelectorAll(".cdk-overlay-container").forEach(element => element.remove())
})

describe("WP10 T14 customer account request in the create/edit dialog", () => {
  it("sends no account field at all when a new customer leaves the box unchecked", async () => {
    const s = await setup()
    await s.openCreate()
    expect(s.dialog().textContent).toContain("Crear cliente")
    expect(s.control<HTMLInputElement>("#customer-create-account").checked).toBe(false)
    expect(s.dialog().querySelector("#customer-account-password")).toBeNull()
    await s.fill("#customer-name", "  Ana  ")
    await s.submit()
    expect(s.create).toHaveBeenCalledExactlyOnceWith({
      name: "Ana",
      type: "residencial",
      email: null,
      phone: null
    })
    expect(Object.keys(s.create.mock.calls[0][0])).not.toContain("createAccount")
    expect(Object.keys(s.create.mock.calls[0][0])).not.toContain("password")
  })

  it("requires the customer email and a password as soon as the account is requested", async () => {
    const s = await setup()
    await s.openCreate()
    await s.fill("#customer-name", "Ana")
    await s.toggleAccount()
    expect(s.dialog().querySelector("#customer-account-password")).not.toBeNull()
    await s.submit()
    expect(s.create).not.toHaveBeenCalled()
    expect(s.dialog().textContent).toContain("La cuenta del portal necesita el correo del cliente.")
    expect(s.dialog().textContent).toContain(
      "La cuenta del portal necesita una contraseña inicial."
    )
  })

  it("creates the account with the initial password only when the box is checked", async () => {
    const s = await setup()
    await s.openCreate()
    await s.fill("#customer-name", "Ana")
    await s.fill("#customer-email", "ana@example.test")
    await s.toggleAccount()
    await s.fill("#customer-account-password", "Clave1234")
    await s.submit()
    expect(s.create).toHaveBeenCalledExactlyOnceWith({
      name: "Ana",
      type: "residencial",
      email: "ana@example.test",
      phone: null,
      createAccount: true,
      password: "Clave1234"
    })
  })

  it("shows the loaded account state and leaves an untouched active account alone", async () => {
    const s = await setup(record(true, 11))
    await s.openEdit(record(true, 11))
    const state = s.control("#customer-account-state").textContent
    expect(state).toContain("activa")
    expect(state).not.toContain("desactivada")
    expect(s.control<HTMLInputElement>("#customer-create-account").checked).toBe(true)
    expect(s.dialog().querySelector("#customer-account-password")).toBeNull()
    await s.submit()
    expect(s.update).toHaveBeenCalledTimes(1)
    const params = s.update.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(Object.keys(params)).not.toContain("createAccount")
    expect(Object.keys(params)).not.toContain("password")
  })

  it("asks for explicit confirmation before retiring an active account, then sends false without a password", async () => {
    const customer = record(true, 11)
    const s = await setup(customer)
    await s.openEdit(customer)
    await s.toggleAccount()
    expect(s.dialog().textContent).toContain("Confirmar baja de la cuenta")
    await s.submit()
    expect(s.update).not.toHaveBeenCalled()
    await s.click("Confirmar baja de la cuenta")
    await s.submit()
    expect(s.update).toHaveBeenCalledTimes(1)
    const params = s.update.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(params).toMatchObject({ id: 7, createAccount: false })
    expect(Object.keys(params)).not.toContain("password")
  })

  it("recreates a deactivated account with a new password when the box is checked again", async () => {
    const customer = record(false, 11)
    const s = await setup(customer)
    await s.openEdit(customer)
    expect(s.control("#customer-account-state").textContent).toContain("desactivada")
    expect(s.control<HTMLInputElement>("#customer-create-account").checked).toBe(false)
    await s.toggleAccount()
    await s.fill("#customer-account-password", "Nueva1234")
    await s.submit()
    expect(s.update).toHaveBeenCalledTimes(1)
    expect(s.update.mock.calls[0][0]).toMatchObject({
      id: 7,
      email: "ana@example.test",
      createAccount: true,
      password: "Nueva1234"
    })
  })

  it("creates a first account for an existing customer without one, and needs no email when unchecked again", async () => {
    const customer = record(null)
    const s = await setup(customer)
    await s.openEdit(customer)
    expect(s.control("#customer-account-state").textContent).toContain("sin cuenta")
    expect(s.control<HTMLInputElement>("#customer-create-account").checked).toBe(false)
    await s.toggleAccount()
    await s.fill("#customer-account-password", "Clave1234")
    await s.submit()
    expect(s.update.mock.calls[0][0]).toMatchObject({
      id: 7,
      createAccount: true,
      password: "Clave1234"
    })
  })

  it("cancels a requested retirement when the confirmation is withdrawn", async () => {
    const customer = record(true, 11)
    const s = await setup(customer)
    await s.openEdit(customer)
    await s.toggleAccount()
    await s.click("Confirmar baja de la cuenta")
    expect(s.dialog().textContent).toContain("Baja confirmada")
    await s.click("Mantener la cuenta")
    expect(s.control<HTMLInputElement>("#customer-create-account").checked).toBe(true)
    expect(s.dialog().textContent).not.toContain("Confirmar baja de la cuenta")
    await s.submit()
    const params = s.update.mock.calls[0][0] as unknown as Record<string, unknown>
    expect(Object.keys(params)).not.toContain("createAccount")
  })

  it.each([
    ["ACCOUNT_EMAIL_REQUIRED", "#customer-email-account-error", "necesita el correo"],
    ["EMAIL_RESERVED", "#customer-email-account-error", "ya pertenece a una cuenta"],
    ["ACCOUNT_PASSWORD_REQUIRED", "#customer-account-password-error", "necesita una contraseña"]
  ] as const)("binds %s to its own field without a general alert", async (code, selector, copy) => {
    const s = await setup()
    await s.openCreate()
    await s.fill("#customer-name", "Ana")
    await s.fill("#customer-email", "ana@example.test")
    await s.toggleAccount()
    await s.fill("#customer-account-password", "Clave1234")
    await s.submit()
    s.response.next(Result.failure(new CustomerError(code as CustomerErrorCode)))
    await s.settle()
    expect(s.control(selector).textContent).toContain(copy)
    expect(s.dialog().querySelector("div[role='alert']")).toBeNull()
  })

  it("keeps a hidden password marker visible in the alert instead of losing it", async () => {
    const s = await setup()
    await s.openCreate()
    await s.fill("#customer-name", "Ana")
    await s.submit()
    s.response.next(Result.failure(new CustomerError("ACCOUNT_PASSWORD_WITHOUT_ACCOUNT")))
    await s.settle()
    expect(s.control("div[role='alert']").textContent).toContain(
      "Solo se envía una contraseña cuando se solicita la cuenta"
    )
  })

  it("blocks a duplicate submit while pending and closes only after confirmed success", async () => {
    const customer = record(true, 11)
    const s = await setup(customer)
    await s.openEdit(customer)
    await s.submit()
    await s.submit()
    expect(s.update).toHaveBeenCalledTimes(1)
    expect(s.success).not.toHaveBeenCalled()
    expect(s.dialog()).not.toBeNull()
    s.response.next(Result.success(customer))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Cliente actualizado correctamente.")
    expect(document.querySelector("app-customer-editor")).toBeNull()
  })
})
