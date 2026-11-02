import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { BehaviorSubject, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { CreateCustomerUseCase } from "../../../application/use-cases/create-customer.use-case"
import { UpdateCustomerUseCase } from "../../../application/use-cases/update-customer.use-case"
import { SetCustomerStatusUseCase } from "../../../application/use-cases/set-customer-status.use-case"
import { ListCustomersUseCase } from "../../../application/use-cases/list-customers.use-case"
import { customerFixture } from "../../../domain/customer.fixture"
import { Customer } from "../../../domain/entities/customer.entity"
import { CustomerError, CustomerErrorCode } from "../../../domain/errors/customer.error"
import { HotToastService } from "@ngxpert/hot-toast"
import { CustomersPage } from "./customers-page"
import { CustomerHistoryStore } from "../../state/customer-history.store"
import { CustomersStore } from "../../state/customers.store"

type Write = Result<Customer, CustomerError>
type Page = Result<PaginationResponse<Customer>, CustomerError>
const customer = customerFixture(7, "Cliente seleccionado", "old@example.test", "555 0100")

async function setup() {
  const pages: Subject<Page>[] = []
  const read = vi.fn(() => {
    const response = new Subject<Page>()
    pages.push(response)
    return response
  })
  const response = new Subject<Write>()
  const create = vi.fn(() => response)
  const update = vi.fn(() => response)
  const status = vi.fn(() => response)
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "identity@example.test", null, Date.now() + 600000, 7)
  )
  const success = vi.fn()
  TestBed.configureTestingModule({
    imports: [CustomersPage],
    providers: [
      provideRouter([]),
      { provide: HotToastService, useValue: { success } },
      { provide: CustomerHistoryStore, useValue: { invalidateCustomer: vi.fn() } },
      { provide: ListCustomersUseCase, useValue: { execute: read } },
      { provide: CreateCustomerUseCase, useValue: { execute: create } },
      { provide: UpdateCustomerUseCase, useValue: { execute: update } },
      { provide: SetCustomerStatusUseCase, useValue: { execute: status } },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } }
    ]
  })
  const fixture = TestBed.createComponent(CustomersPage)
  const root = fixture.nativeElement as HTMLElement
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  await settle()
  pages[0].next(Result.success({ items: [customer], total: 45, offset: 0, limit: 5 }))
  pages[0].complete()
  await settle()
  const click = async (label: string, within: ParentNode = root) => {
    const button = Array.from(within.querySelectorAll<HTMLButtonElement>("button")).find(
      item => item.getAttribute("aria-label") === label || item.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const dialog = () =>
    document.querySelector<HTMLElement>("app-customer-editor, app-customer-status-dialog")!
  const fill = async (id: string, value: string) => {
    const input = dialog().querySelector<HTMLInputElement | HTMLSelectElement>(`#customer-${id}`)!
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
  return {
    fixture,
    success,
    root,
    pages,
    read,
    create,
    update,
    status,
    response,
    session,
    settle,
    click,
    dialog,
    fill,
    submit
  }
}

afterEach(() => vi.restoreAllMocks())

describe("CRM WP3 writes through public UI", () => {
  it("offers labeled edit/deactivate on both desktop rows and mobile cards", async () => {
    const s = await setup()
    for (const container of [s.root.querySelector("tbody")!, s.root.querySelector("ul")!]) {
      expect(container.querySelector('[aria-label="Editar Cliente seleccionado"]')).not.toBeNull()
      expect(
        container.querySelector('[aria-label="Desactivar Cliente seleccionado"]')
      ).not.toBeNull()
    }
    expect(s.root.textContent).not.toMatch(/Reactivar|Eliminar|Propiedades/)
  })

  it("creates only the profile, trims input, sends null replacements and waits for confirmed server refresh", async () => {
    const s = await setup()
    await s.click("Crear cliente")
    await s.fill("name", "  Nuevo cliente  ")
    await s.fill("type", "comercial")
    await s.fill("email", "   ")
    await s.fill("phone", "   ")
    await s.submit()
    expect(s.create).toHaveBeenCalledExactlyOnceWith({
      name: "Nuevo cliente",
      type: "comercial",
      email: null,
      phone: null
    })
    expect(s.root.textContent).toContain("1–1 de 45")
    expect(s.root.textContent).not.toContain("Cliente creado correctamente")
    expect(s.success).not.toHaveBeenCalled()
    expect(s.read).toHaveBeenCalledTimes(1)
    s.response.next(Result.success(customerFixture(8, "Nuevo cliente")))
    s.response.complete()
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Cliente creado correctamente.")
    expect(s.root.textContent).not.toContain("Cliente creado correctamente")
    expect(s.read).toHaveBeenCalledTimes(2)
    expect(s.read).toHaveBeenLastCalledWith({ offset: 0, limit: 5 })
    expect(s.root.textContent).toContain(customer.name)
    expect(s.root.textContent).toContain("1–1 de 45")
    s.pages[1].next(Result.success({ items: [], total: 0, offset: 0, limit: 5 }))
    s.pages[1].complete()
    await s.settle()
    expect(s.root.textContent).toContain("0–0 de 0")
    expect(s.read).toHaveBeenCalledTimes(2)
  })

  it("edits the captured loaded identity without metadata, status, or duplicate list reload", async () => {
    const s = await setup()
    await s.click(`Editar ${customer.name}`)
    expect(s.dialog().querySelector<HTMLInputElement>("#customer-name")!.value).toBe(customer.name)
    expect(s.dialog().querySelector<HTMLInputElement>("#customer-email")!.value).toBe(
      customer.email
    )
    await s.fill("name", "  Editado  ")
    await s.fill("email", " new@example.test ")
    await s.fill("phone", " +1 (555) 0100 ")
    await s.submit()
    expect(s.update).toHaveBeenCalledExactlyOnceWith({
      id: 7,
      name: "Editado",
      type: "residencial",
      email: "new@example.test",
      phone: "+1 (555) 0100"
    })
    expect(s.status).not.toHaveBeenCalled()
    s.response.next(Result.success(customerFixture(7, "Editado")))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Cliente actualizado correctamente.")
    expect(s.root.textContent).not.toContain("Cliente actualizado correctamente")
    expect(s.read).toHaveBeenCalledTimes(2)
  })

  it.each([
    ["name", "   ", "Ingresa el nombre"],
    ["name", "a".repeat(151), "150"],
    ["email", "malformed", "correo válido"],
    ["email", "a".repeat(112) + "@test.test", "120"],
    ["phone", "123", "teléfono válido"],
    ["phone", "555.0100", "teléfono válido"],
    ["phone", "1".repeat(31), "30"]
  ])("rejects invalid %s without dispatch", async (field, value, message) => {
    const s = await setup()
    await s.click("Crear cliente")
    await s.fill("name", "Válido")
    await s.fill(field, value)
    await s.submit()
    expect(s.create).not.toHaveBeenCalled()
    expect(s.dialog().textContent).toContain(message)
  })

  it("accepts exact profile limits and rejects a missing type", async () => {
    const s = await setup()
    await s.click("Crear cliente")
    const select = s.dialog().querySelector("select")!
    const option = document.createElement("option")
    option.value = ""
    select.append(option)
    await s.fill("type", "")
    await s.fill("name", "a".repeat(150))
    await s.submit()
    expect(s.create).not.toHaveBeenCalled()
    expect(s.dialog().textContent).toContain("Selecciona el tipo")
    await s.fill("type", "residencial")
    await s.fill("email", "a".repeat(110) + "@test.test")
    await s.fill("phone", "1".repeat(30))
    await s.submit()
    expect(s.create).toHaveBeenCalledOnce()
  })

  it.each(["FORBIDDEN", "CONFLICT", "NETWORK", "UNAUTHENTICATED"] as CustomerErrorCode[])(
    "keeps input and verified rows on %s, without success or auto retry",
    async code => {
      const s = await setup()
      await s.click(`Editar ${customer.name}`)
      await s.fill("name", "Borrador")
      await s.fill("email", "")
      await s.fill("phone", "")
      await s.submit()
      expect(s.update).toHaveBeenLastCalledWith({
        id: 7,
        name: "Borrador",
        type: "residencial",
        email: null,
        phone: null
      })
      s.response.next(Result.failure(new CustomerError(code)))
      await s.settle()
      expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
      expect(s.dialog().querySelector<HTMLInputElement>("#customer-name")!.value).toBe("Borrador")
      expect(s.root.textContent).toContain("1–1 de 45")
      expect(s.root.textContent).toContain(customer.name)
      expect(s.root.textContent).not.toContain("actualizado correctamente")
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read).toHaveBeenCalledTimes(1)
      expect(s.update).toHaveBeenCalledTimes(1)
    }
  )

  it.each(["editor", "status"])(
    "guards %s duplicates and pending Cancel/Escape/outside; idle cancellation works",
    async mode => {
      const s = await setup()
      await s.click(mode === "editor" ? "Crear cliente" : `Desactivar ${customer.name}`)
      if (mode === "editor") {
        await s.fill("name", "Válido")
        await s.submit()
        await s.submit()
      } else {
        await s.click("Confirmar desactivación", s.dialog())
        s.dialog().querySelectorAll<HTMLButtonElement>("button")[1].click()
        await s.settle()
      }
      const cdk = getDebugNode(s.dialog())!.injector.get(CdkDialogRef)
      expect(s.dialog().querySelector<HTMLButtonElement>('button[type="button"]')!.disabled).toBe(
        true
      )
      await s.click("Cancelar", s.dialog())
      cdk.overlayRef.backdropElement!.click()
      document.body.click()
      s.dialog().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
      )
      await s.settle()
      expect(s.dialog()).not.toBeNull()
      expect(mode === "editor" ? s.create : s.status).toHaveBeenCalledOnce()
      s.response.next(Result.failure(new CustomerError("NETWORK")))
      await s.settle()
      s.dialog().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
      )
      await s.settle()
      expect(s.dialog()).toBeNull()
    }
  )

  it.each(["Cancelar", "outside", "backdrop"])("allows idle %s without any write", async action => {
    const s = await setup()
    await s.click("Crear cliente")
    const cdk = getDebugNode(s.dialog())!.injector.get(CdkDialogRef)
    if (action === "Cancelar") await s.click(action, s.dialog())
    else if (action === "outside") document.body.click()
    else cdk.overlayRef.backdropElement!.click()
    await s.settle()
    expect(s.dialog()).toBeNull()
    expect(s.create).not.toHaveBeenCalled()
  })

  it("confirms the selected customer and sends desired false, never deletes or toggles", async () => {
    const s = await setup()
    await s.click(`Desactivar ${customer.name}`)
    expect(s.dialog().textContent).toContain(customer.name)
    expect(s.status).not.toHaveBeenCalled()
    await s.click("Confirmar desactivación", s.dialog())
    expect(s.status).toHaveBeenCalledExactlyOnceWith({ customerId: 7, isActive: false })
    expect(s.root.textContent).toContain(customer.name)
    s.response.next(Result.success({ ...customer, isActive: false }))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Cliente desactivado correctamente.")
    expect(s.root.textContent).not.toContain("Cliente desactivado correctamente")
    expect(s.read).toHaveBeenCalledTimes(2)
    expect(s.root.textContent).toContain("1–1 de 45")
  })

  it("keeps a failed deactivation open and retries only on an explicit second confirmation", async () => {
    const s = await setup()
    await s.click(`Desactivar ${customer.name}`)
    await s.click("Confirmar desactivación", s.dialog())
    s.response.next(Result.failure(new CustomerError("FORBIDDEN")))
    await s.settle()
    expect(s.dialog().querySelector('[role="alert"]')?.textContent).toContain("No tienes permiso")
    expect(s.read).toHaveBeenCalledTimes(1)
    expect(s.status).toHaveBeenCalledTimes(1)
    await s.click("Confirmar desactivación", s.dialog())
    expect(s.status.mock.calls).toEqual([
      [{ customerId: 7, isActive: false }],
      [{ customerId: 7, isActive: false }]
    ])
    s.response.next(Result.success({ ...customer, isActive: false }))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Cliente desactivado correctamente.")
    expect(s.read).toHaveBeenCalledTimes(2)
  })

  it("preserves captured identity through page refresh and same-session renewal while pending", async () => {
    const s = await setup()
    await s.click(`Desactivar ${customer.name}`)
    TestBed.inject(CustomersStore).invalidateCustomers()
    s.pages[1].next(
      Result.success({ items: [customerFixture(8, "Otra fila")], total: 45, offset: 0, limit: 5 })
    )
    s.pages[1].complete()
    await s.settle()
    expect(s.root.textContent).not.toContain(customer.name)
    expect(s.dialog().textContent).toContain(customer.name)
    await s.click("Confirmar desactivación", s.dialog())
    const current = s.session.value!
    s.session.next(
      AuthSession.create(current.name, current.email, current.role, current.expiresAt, current.id)
    )
    await s.settle()
    expect(s.response.observed).toBe(true)
    expect(s.dialog().textContent).toContain(customer.name)
    s.response.next(Result.success({ ...customer, isActive: false }))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Cliente desactivado correctamente.")
    expect(s.status).toHaveBeenCalledExactlyOnceWith({ customerId: 7, isActive: false })
  })

  it.each(["destroy", "logout", "replacement"])(
    "cancels writes and suppresses stale UI after %s",
    async reason => {
      const s = await setup()
      await s.click(`Desactivar ${customer.name}`)
      await s.click("Confirmar desactivación", s.dialog())
      expect(s.response.observed).toBe(true)
      if (reason === "destroy") s.fixture.destroy()
      else
        s.session.next(
          reason === "logout"
            ? null
            : AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8)
        )
      expect(s.response.observed).toBe(false)
      s.response.next(Result.success(customer))
      if (reason !== "destroy") await s.settle()
      expect(s.root.textContent).not.toContain("desactivado correctamente")
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read).toHaveBeenCalledTimes(1)
    }
  )
})
