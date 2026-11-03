import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { getDebugNode, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router"
import { BehaviorSubject, Observable, Subject, of } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HotToastService } from "@ngxpert/hot-toast"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { customerFixture } from "../../../domain/customer.fixture"
import { Customer } from "../../../domain/entities/customer.entity"
import { CustomerContact } from "../../../domain/entities/customer-contact.entity"
import { CustomerError, CustomerErrorCode } from "../../../domain/errors/customer.error"
import { GetCustomerByIdUseCase } from "../../../application/use-cases/get-customer-by-id.use-case"
import {
  ListCustomerPropertiesUseCase,
  CreatePropertyUseCase,
  UpdatePropertyUseCase,
  SetPropertyStatusUseCase
} from "../../../application/use-cases/property.use-cases"
import {
  CreateCustomerContactUseCase,
  UpdateCustomerContactUseCase,
  ListCustomerContactsUseCase,
  ListCustomerPreferencesUseCase,
  CreateCustomerPreferenceUseCase,
  UpdateCustomerPreferenceUseCase
} from "../../../application/use-cases/customer-relations.use-cases"
import { CustomerHistoryStore } from "../../state/customer-history.store"
import { CustomerRelationsStore } from "../../state/customer-relations.store"
import { CustomerDetailPage } from "../../pages/customer-detail-page/customer-detail-page"

const contact = CustomerContact.create(3, 7, "Contacto de prueba", null, null, null, true, false)
const blank = {
  name: "Nuevo contacto",
  position: null,
  email: null,
  phone: null,
  isPrimary: false,
  isActive: true
}
type ContactResult = Result<readonly CustomerContact[], CustomerError>
async function setup(server = false) {
  const response = new Subject<Result<CustomerContact, CustomerError>>()
  const profile = new Subject<Result<Customer, CustomerError>>()
  const create = vi.fn(() => response),
    update = vi.fn(() => response)
  const read = vi.fn((id: number): Observable<ContactResult> =>
    of(Result.success(id === 7 ? [contact] : []))
  )
  const properties = vi.fn(() => of(Result.success([])))
  const preferences = vi.fn(),
    success = vi.fn(),
    invalidateCustomer = vi.fn()
  const params = new BehaviorSubject(convertToParamMap({ id: "7" }))
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "test@example.test", null, Date.now() + 600000, 7)
  )
  const get = vi.fn((id: number) =>
    id === 7 ? profile : of(Result.success(customerFixture(id, `Cliente ${id}`)))
  )
  TestBed.configureTestingModule({
    imports: [CustomerDetailPage],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: params,
          queryParamMap: of(convertToParamMap({ offset: "10", limit: "5" })),
          snapshot: { queryParamMap: convertToParamMap({}) }
        }
      },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      { provide: HotToastService, useValue: { success } },
      { provide: CustomerHistoryStore, useValue: { invalidateCustomer } },
      { provide: GetCustomerByIdUseCase, useValue: { execute: get } },
      { provide: ListCustomerPropertiesUseCase, useValue: { execute: properties } },
      ...[CreatePropertyUseCase, UpdatePropertyUseCase, SetPropertyStatusUseCase].map(provide => ({
        provide,
        useValue: { execute: vi.fn() }
      })),
      { provide: ListCustomerContactsUseCase, useValue: { execute: read } },
      { provide: CreateCustomerContactUseCase, useValue: { execute: create } },
      { provide: UpdateCustomerContactUseCase, useValue: { execute: update } },
      {
        provide: ListCustomerPreferencesUseCase,
        useValue: { execute: () => of(Result.success([])) }
      },
      ...[CreateCustomerPreferenceUseCase, UpdateCustomerPreferenceUseCase].map(provide => ({
        provide,
        useValue: { execute: preferences }
      })),
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const fixture = TestBed.createComponent(CustomerDetailPage),
    root = fixture.nativeElement as HTMLElement
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const dialog = () => document.querySelector<HTMLElement>("app-contact-editor")!
  const click = async (label: string, within: ParentNode = root) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const fill = async (field: string, value: string) => {
    const input = dialog().querySelector<HTMLInputElement>(`#contact-${field}`)!
    input.value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("blur"))
    await settle()
  }
  const submit = async () => {
    dialog()
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  const loaded = async () => {
    profile.next(Result.success(customerFixture(7, "Cliente 7")))
    await settle()
  }
  await settle()
  return {
    fixture,
    root,
    settle,
    dialog,
    click,
    fill,
    submit,
    loaded,
    profile,
    response,
    read,
    create,
    update,
    properties,
    preferences,
    success,
    invalidateCustomer,
    params,
    session,
    get
  }
}
afterEach(() => vi.restoreAllMocks())

describe("WP5 contacts public detail consumer", () => {
  it("reads only a verified owner, includes inactive/null contacts in responsive records, and preserves return context", async () => {
    const s = await setup()
    expect(s.read).not.toHaveBeenCalled()
    s.profile.next(Result.failure(new CustomerError("FORBIDDEN")))
    await s.settle()
    expect(s.read).not.toHaveBeenCalled()
    await s.click("Reintentar cliente")
    await s.loaded()
    expect(s.read).toHaveBeenCalledExactlyOnceWith(7)
    expect(s.root.querySelector("[catalogDesktop]")?.textContent).toContain(contact.name)
    expect(s.root.querySelector("[catalogMobile]")?.textContent).toContain(contact.name)
    expect(s.root.textContent).toContain("Inactivo")
    expect(s.root.textContent).toContain("Principal")
    expect(s.root.textContent).toContain("No registrado")
    expect(s.root.querySelector("a")?.getAttribute("href")).toBe(
      "/admin/customers?offset=10&limit=5"
    )
    expect(s.preferences).not.toHaveBeenCalled()
  })
  it("distinguishes initial loading, denied, verified empty, stale refresh/error and explicit retry", async () => {
    const s = await setup()
    const first = new Subject<ContactResult>()
    s.read.mockReturnValueOnce(first)
    await s.loaded()
    expect(s.root.textContent).toContain("Cargando contactos")
    expect(s.root.textContent).not.toContain("No hay contactos")
    first.next(Result.failure(new CustomerError("FORBIDDEN")))
    first.complete()
    await s.settle()
    expect(s.root.textContent).toContain("No se pudieron consultar los contactos")
    expect(s.root.textContent).not.toContain("No hay contactos")
    s.read.mockReturnValueOnce(of(Result.success([])))
    await s.click("Reintentar contactos")
    expect(s.root.textContent).toContain("No hay contactos registrados")
    // Public store read updates the same projection; no copied writable component cache.
    const refresh = new Subject<ContactResult>()
    s.read.mockReturnValueOnce(refresh)
    const sub = TestBed.inject(CustomerRelationsStore).loadContacts(7, true).subscribe()
    refresh.next(Result.success([contact]))
    refresh.complete()
    await s.settle()
    sub.unsubscribe()
    const failed = new Subject<ContactResult>()
    s.read.mockReturnValueOnce(failed)
    const again = TestBed.inject(CustomerRelationsStore).loadContacts(7, true).subscribe()
    await s.settle()
    expect(s.root.textContent).toContain("Actualizando contactos")
    expect(s.root.textContent).toContain(contact.name)
    failed.next(Result.failure(new CustomerError("NETWORK")))
    failed.complete()
    await s.settle()
    expect(s.root.textContent).toContain("desactualizados")
    expect(s.root.textContent).toContain(contact.name)
    await s.click("Reintentar contactos")
    again.unsubscribe()
  })
  it("creates a full trimmed nullable replacement and revalidates contacts exactly once only after confirmed success", async () => {
    const s = await setup()
    await s.loaded()
    await s.click("Nuevo contacto")
    expect(s.dialog().textContent).toContain("Cliente 7")
    await s.fill("name", "  Nuevo contacto  ")
    await s.fill("position", "  ")
    await s.submit()
    expect(s.create).toHaveBeenCalledExactlyOnceWith(7, blank)
    expect(s.success).not.toHaveBeenCalled()
    expect(s.read).toHaveBeenCalledTimes(1)
    s.response.next(Result.success(contact))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Contacto creado correctamente.")
    expect(s.read).toHaveBeenCalledTimes(2)
    expect(s.read).toHaveBeenLastCalledWith(7)
    expect(s.properties).toHaveBeenCalledTimes(1)
    expect(s.preferences).not.toHaveBeenCalled()
    expect(s.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(7)
    expect(s.get).toHaveBeenCalledTimes(1)
  })
  it("edits an inactive contact with captured identity and explicit booleans/nulls, without a lifecycle endpoint", async () => {
    const s = await setup()
    await s.loaded()
    await s.click(`Editar contacto ${contact.name}`)
    expect(s.dialog().textContent).toContain("ID 3")
    await s.fill("position", " Cargo ")
    await s.fill("email", " example@test.test ")
    await s.fill("phone", " extensión 12 ")
    await s.submit()
    expect(s.update).toHaveBeenCalledExactlyOnceWith(7, {
      id: 3,
      name: contact.name,
      position: "Cargo",
      email: "example@test.test",
      phone: "extensión 12",
      isPrimary: true,
      isActive: false
    })
    s.response.next(Result.success(contact))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Contacto actualizado correctamente.")
    expect(s.root.textContent).toContain(contact.name)
  })
  it.each([
    ["name", " "],
    ["name", "a".repeat(121)],
    ["position", "a".repeat(81)],
    ["email", "invalid"],
    ["email", "a".repeat(111) + "@test.test"],
    ["phone", "1".repeat(31)]
  ])("rejects invalid %s without dispatch", async (field, value) => {
    const s = await setup()
    await s.loaded()
    await s.click("Nuevo contacto")
    await s.fill("name", "Válido")
    await s.fill(field, value)
    await s.submit()
    expect(s.create).not.toHaveBeenCalled()
    expect(s.dialog().querySelector("hlm-field-error")).not.toBeNull()
  })
  it("accepts exact limits and explicit primary/active choices without inventing primary uniqueness", async () => {
    const s = await setup()
    await s.loaded()
    await s.click("Nuevo contacto")
    await s.fill("name", "a".repeat(120))
    await s.fill("position", "a".repeat(80))
    await s.fill("email", "a".repeat(110) + "@test.test")
    await s.fill("phone", "1".repeat(30))
    s.dialog().querySelector<HTMLElement>("#contact-isPrimary")!.click()
    s.dialog().querySelector<HTMLElement>("#contact-isActive")!.click()
    await s.settle()
    await s.submit()
    expect(s.create).toHaveBeenCalledExactlyOnceWith(7, {
      name: "a".repeat(120),
      position: "a".repeat(80),
      email: "a".repeat(110) + "@test.test",
      phone: "1".repeat(30),
      isPrimary: true,
      isActive: false
    })
  })
  it.each([
    "FORBIDDEN",
    "CONFLICT",
    "NETWORK",
    "NOT_FOUND",
    "INVALID_RESPONSE",
    "INVALID_INPUT"
  ] as CustomerErrorCode[])(
    "keeps draft/context on safe %s, without retry or false feedback",
    async code => {
      const s = await setup()
      await s.loaded()
      await s.click(`Editar contacto ${contact.name}`)
      await s.fill("name", "Borrador")
      await s.submit()
      s.response.next(Result.failure(new CustomerError(code)))
      await s.settle()
      expect(s.dialog().querySelector<HTMLInputElement>("#contact-name")!.value).toBe("Borrador")
      expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
      expect(s.dialog().textContent).not.toContain(new CustomerError(code).message)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.update).toHaveBeenCalledOnce()
      expect(s.read).toHaveBeenCalledTimes(1)
    }
  )
  it("retains rows with a visible failed revalidation after success, never replays a write", async () => {
    const s = await setup()
    await s.loaded()
    await s.click("Nuevo contacto")
    await s.fill("name", "Válido")
    await s.submit()
    s.read.mockReturnValueOnce(of(Result.failure(new CustomerError("NETWORK"))))
    s.response.next(Result.success(contact))
    await s.settle()
    expect(s.success).toHaveBeenCalledOnce()
    expect(s.read).toHaveBeenCalledTimes(2)
    expect(s.root.textContent).toContain(contact.name)
    expect(s.root.textContent).toContain("desactualizados")
    expect(s.create).toHaveBeenCalledOnce()
  })
  it("blocks pending duplicate/Cancel/Escape/backdrop/outside, then allows idle Escape", async () => {
    const s = await setup()
    await s.loaded()
    await s.click("Nuevo contacto")
    await s.fill("name", "Válido")
    await s.submit()
    await s.submit()
    const cdk = getDebugNode(s.dialog())!.injector.get(CdkDialogRef)
    await s.click("Cancelar", s.dialog())
    cdk.overlayRef.backdropElement!.click()
    document.body.click()
    s.dialog().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    await s.settle()
    expect(s.dialog()).not.toBeNull()
    expect(s.create).toHaveBeenCalledOnce()
    s.response.next(Result.failure(new CustomerError("NETWORK")))
    await s.settle()
    s.dialog().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    await s.settle()
    expect(s.dialog()).toBeNull()
  })
  it.each(["Cancelar", "backdrop", "outside"])("permits idle %s with no write", async action => {
    const s = await setup()
    await s.loaded()
    await s.click("Nuevo contacto")
    const cdk = getDebugNode(s.dialog())!.injector.get(CdkDialogRef)
    if (action === "Cancelar") await s.click(action, s.dialog())
    else if (action === "backdrop") cdk.overlayRef.backdropElement!.click()
    else document.body.click()
    await s.settle()
    expect(s.dialog()).toBeNull()
    expect(s.create).not.toHaveBeenCalled()
  })
  it.each(["owner", "destroy", "replacement", "logout", "dialog", "closing"])(
    "cancels and fences writes/feedback/read on %s",
    async reason => {
      const s = await setup()
      await s.loaded()
      await s.click("Nuevo contacto")
      await s.fill("name", "Válido")
      await s.submit()
      expect(s.response.observed).toBe(true)
      if (reason === "destroy") s.fixture.destroy()
      else if (reason === "owner") s.params.next(convertToParamMap({ id: "8" }))
      else if (reason === "dialog") getDebugNode(s.dialog())!.injector.get(CdkDialogRef).close()
      else if (reason === "closing") {
        const { BrnDialogRef } = await import("@spartan-ng/brain/dialog")
        getDebugNode(s.dialog())!.injector.get(BrnDialogRef).close()
      } else
        s.session.next(
          reason === "logout"
            ? null
            : AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8)
        )
      s.response.next(Result.success(contact))
      if (reason !== "destroy") await s.settle()
      expect(s.response.observed).toBe(false)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read.mock.calls.filter(([id]) => id === 7)).toHaveLength(1)
      if (reason === "owner") expect(s.root.textContent).not.toContain(contact.name)
    }
  )
  it("preserves pending writes on same-session renewal", async () => {
    const s = await setup()
    await s.loaded()
    await s.click("Nuevo contacto")
    await s.fill("name", "Válido")
    await s.submit()
    const c = s.session.value!
    s.session.next(AuthSession.create(c.name, c.email, c.role, c.expiresAt, c.id))
    await s.settle()
    expect(s.response.observed).toBe(true)
    s.response.next(Result.success(contact))
    await s.settle()
    expect(s.success).toHaveBeenCalledOnce()
    expect(s.read).toHaveBeenCalledTimes(2)
  })
  it.each(["owner", "destroy", "logout", "replacement"])(
    "cancels pending reads on %s without cross-owner rows",
    async reason => {
      const s = await setup()
      const pending = new Subject<ContactResult>()
      s.read.mockReturnValueOnce(pending)
      await s.loaded()
      expect(pending.observed).toBe(true)
      if (reason === "destroy") s.fixture.destroy()
      else if (reason === "owner") {
        s.read.mockReturnValueOnce(of(Result.success([])))
        s.params.next(convertToParamMap({ id: "8" }))
      } else
        s.session.next(
          reason === "logout"
            ? null
            : AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8)
        )
      if (reason !== "destroy") await s.settle()
      expect(pending.observed).toBe(false)
      pending.next(Result.success([contact]))
      if (reason !== "destroy") {
        await s.settle()
        expect(s.root.textContent).not.toContain(contact.name)
      }
    }
  )
  it("replaces filled edit optionals with null and sends both changed flags for the captured contact", async () => {
    const s = await setup()
    s.read.mockReturnValueOnce(
      of(
        Result.success([
          CustomerContact.create(
            3,
            7,
            contact.name,
            "Cargo",
            "example@test.test",
            "123",
            true,
            false
          )
        ])
      )
    )
    await s.loaded()
    await s.click(`Editar contacto ${contact.name}`)
    await s.fill("position", " ")
    await s.fill("email", "")
    await s.fill("phone", " ")
    s.dialog().querySelector<HTMLElement>("#contact-isPrimary")!.click()
    s.dialog().querySelector<HTMLElement>("#contact-isActive")!.click()
    await s.settle()
    await s.submit()
    expect(s.update).toHaveBeenCalledExactlyOnceWith(7, {
      id: 3,
      name: contact.name,
      position: null,
      email: null,
      phone: null,
      isPrimary: false,
      isActive: true
    })
  })
  it("retains captured contact while same-owner data refreshes", async () => {
    const s = await setup()
    await s.loaded()
    await s.click(`Editar contacto ${contact.name}`)
    expect(document.querySelectorAll("app-contact-editor")).toHaveLength(1)
    s.read.mockReturnValueOnce(
      of(
        Result.success([CustomerContact.create(3, 7, "Otro nombre", null, null, null, false, true)])
      )
    )
    const sub = TestBed.inject(CustomerRelationsStore).loadContacts(7, true).subscribe()
    await s.settle()
    sub.unsubscribe()
    expect(s.dialog().textContent).toContain(contact.name)
    await s.submit()
    expect(s.update).toHaveBeenCalledExactlyOnceWith(7, {
      id: 3,
      name: contact.name,
      position: null,
      email: null,
      phone: null,
      isPrimary: true,
      isActive: false
    })
  })
  it("accepts an independently loaded inactive customer without inventing a restriction", async () => {
    const s = await setup(),
      c = customerFixture(7, "Cliente inactivo")
    s.profile.next(
      Result.success(
        Customer.create(
          c.id,
          c.name,
          c.userId,
          c.type,
          c.email,
          c.phone,
          c.taxIdentification,
          c.systemOrigin,
          c.externalId,
          false,
          c.createdAt,
          c.updatedAt,
          c.registeredByUserId,
          c.leadId
        )
      )
    )
    await s.settle()
    await s.click("Nuevo contacto")
    await s.fill("name", "Válido")
    await s.submit()
    expect(s.create).toHaveBeenCalledOnce()
  })
  it("dispatches no SSR reads", async () => {
    const s = await setup(true)
    expect(s.read).not.toHaveBeenCalled()
    expect(s.get).not.toHaveBeenCalled()
  })
})
