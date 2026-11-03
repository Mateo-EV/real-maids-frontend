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
import { CustomerPreference } from "../../../domain/entities/customer-preference.entity"
import { Property } from "../../../domain/entities/property.entity"
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
import { CustomerPropertiesStore } from "../../state/customer-properties.store"
import { CustomerDetailPage } from "../../pages/customer-detail-page/customer-detail-page"

const general = CustomerPreference.create(3, 7, null, "General libre", "Detalle general", false)
const scoped = CustomerPreference.create(4, 7, 12, "Especial", "<b>Texto plano</b>", true)
const property = (id = 12, owner = 7) =>
  Property.create(
    id,
    owner,
    "Casa",
    "Dirección",
    null,
    null,
    null,
    null,
    null,
    null,
    "PRIVATE INSTRUCTIONS",
    "PRIVATE CODE",
    false,
    false,
    new Date()
  )
type Read = Result<readonly CustomerPreference[], CustomerError>
async function setup(server = false) {
  const response = new Subject<Result<CustomerPreference, CustomerError>>()
  const profile = new Subject<Result<Customer, CustomerError>>()
  const create = vi.fn(() => response),
    update = vi.fn(() => response)
  const read = vi.fn((id: number): Observable<Read> =>
    of(Result.success(id === 7 ? [general, scoped] : []))
  )
  const properties = vi.fn((): Observable<Result<readonly Property[], CustomerError>> =>
    of(Result.success([property()]))
  )
  const contacts = vi.fn(() => of(Result.success([]))),
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
      { provide: ListCustomerContactsUseCase, useValue: { execute: contacts } },
      ...[CreateCustomerContactUseCase, UpdateCustomerContactUseCase].map(provide => ({
        provide,
        useValue: { execute: vi.fn() }
      })),
      { provide: ListCustomerPreferencesUseCase, useValue: { execute: read } },
      { provide: CreateCustomerPreferenceUseCase, useValue: { execute: create } },
      { provide: UpdateCustomerPreferenceUseCase, useValue: { execute: update } },
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
  const list = () => root.querySelector<HTMLElement>("app-customer-preferences")!
  const dialog = () => document.querySelector<HTMLElement>("app-preference-editor")!
  const click = async (label: string, within: ParentNode = root) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const fill = async (field: string, value: string) => {
    const input = dialog().querySelector<HTMLInputElement>(`#preference-${field}`)!
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
  const loaded = async () => {
    profile.next(Result.success(customerFixture(7, "Cliente 7")))
    await settle()
  }
  const valid = async () => {
    await click("Nueva preferencia")
    await fill("type", " Libre ")
    await fill("detail", " Detalle ")
  }
  await settle()
  return {
    fixture,
    root,
    list,
    dialog,
    settle,
    click,
    fill,
    submit,
    loaded,
    valid,
    profile,
    response,
    read,
    create,
    update,
    properties,
    contacts,
    success,
    invalidateCustomer,
    params,
    session,
    get
  }
}
afterEach(() => vi.restoreAllMocks())
describe("WP5 preferences public owner consumer", () => {
  it("reads only verified customer and renders inactive/general/property scopes in both layouts as plain text", async () => {
    const s = await setup()
    expect(s.read).not.toHaveBeenCalled()
    s.profile.next(Result.failure(new CustomerError("FORBIDDEN")))
    await s.settle()
    expect(s.read).not.toHaveBeenCalled()
    await s.click("Reintentar cliente")
    await s.loaded()
    expect(s.read).toHaveBeenCalledExactlyOnceWith(7)
    for (const layout of ["[catalogDesktop]", "[catalogMobile]"]) {
      expect(s.list().querySelector(layout)?.textContent).toContain("Todo el cliente")
      expect(s.list().querySelector(layout)?.textContent).toContain("Casa")
      expect(s.list().querySelector(layout)?.textContent).toContain("Inactiva")
      expect(s.list().querySelector(layout)?.textContent).toContain(scoped.detail)
    }
    expect(s.list().querySelector("b")).toBeNull()
    expect(s.list().textContent).not.toContain("PRIVATE")
    expect(s.root.querySelector("a")?.getAttribute("href")).toBe(
      "/admin/customers?offset=10&limit=5"
    )
  })
  it("distinguishes loading, denied, verified empty and same-owner stale error/retry", async () => {
    const s = await setup(),
      first = new Subject<Read>()
    s.read.mockReturnValueOnce(first)
    await s.loaded()
    expect(s.list().textContent).toContain("Cargando preferencias")
    expect(s.list().textContent).not.toContain("No hay preferencias")
    first.next(Result.failure(new CustomerError("FORBIDDEN")))
    first.complete()
    await s.settle()
    expect(s.list().textContent).toContain("No se pudieron consultar")
    expect(s.list().textContent).not.toContain("No hay preferencias")
    s.read.mockReturnValueOnce(of(Result.success([])))
    await s.click("Reintentar preferencias")
    expect(s.list().textContent).toContain("No hay preferencias registradas")
    TestBed.inject(CustomerRelationsStore).loadPreferences(7, true).subscribe()
    await s.settle()
    const pending = new Subject<Read>()
    s.read.mockReturnValueOnce(pending)
    TestBed.inject(CustomerRelationsStore).loadPreferences(7, true).subscribe()
    await s.settle()
    expect(s.list().textContent).toContain("Actualizando preferencias")
    expect(s.list().textContent).toContain(general.detail)
    pending.next(Result.failure(new CustomerError("NETWORK")))
    pending.complete()
    await s.settle()
    expect(s.list().textContent).toContain("desactualizados")
    expect(s.list().textContent).toContain(general.detail)
    await s.click("Reintentar preferencias")
  })
  it("creates full trimmed general replacement, no optimism, confirmed generic toast and exactly one preference-only read", async () => {
    const s = await setup()
    await s.loaded()
    await s.valid()
    await s.submit()
    expect(s.create).toHaveBeenCalledExactlyOnceWith(7, {
      propertyId: null,
      type: "Libre",
      detail: "Detalle",
      isActive: true
    })
    expect(s.success).not.toHaveBeenCalled()
    expect(s.read).toHaveBeenCalledTimes(1)
    expect(s.list().textContent).not.toContain("Libre")
    s.response.next(Result.success(general))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Preferencia creada correctamente.")
    expect(s.read).toHaveBeenCalledTimes(2)
    expect(s.read).toHaveBeenLastCalledWith(7)
    expect(s.properties).toHaveBeenCalledTimes(1)
    expect(s.contacts).toHaveBeenCalledTimes(1)
    expect(s.get).toHaveBeenCalledTimes(1)
    expect(s.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(7)
  })
  it("edits inactive general to legitimately loaded inactive property with captured ID and boolean full payload", async () => {
    const s = await setup()
    await s.loaded()
    await s.click("Editar preferencia 3")
    expect(s.dialog().textContent).toContain("Cliente 7")
    expect(s.dialog().querySelector("select")?.textContent).toContain("Inactiva")
    expect(s.dialog().textContent).not.toContain("PRIVATE")
    await s.fill("propertyId", "12")
    await s.fill("type", " Nuevo tipo ")
    await s.fill("detail", " Nuevo detalle ")
    s.dialog().querySelector<HTMLElement>("#preference-isActive")!.click()
    await s.settle()
    await s.submit()
    expect(s.update).toHaveBeenCalledExactlyOnceWith(7, {
      id: 3,
      propertyId: 12,
      type: "Nuevo tipo",
      detail: "Nuevo detalle",
      isActive: true
    })
    s.response.next(Result.success(general))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Preferencia actualizada correctamente.")
  })
  it("explicitly replaces loaded property scope with general and retains inactive status", async () => {
    const s = await setup()
    await s.loaded()
    await s.click("Editar preferencia 4")
    await s.fill("propertyId", "general")
    await s.submit()
    expect(s.update).toHaveBeenCalledExactlyOnceWith(7, {
      id: 4,
      propertyId: null,
      type: scoped.type,
      detail: scoped.detail,
      isActive: true
    })
  })
  it.each([
    ["type", " "],
    ["type", "a".repeat(51)],
    ["detail", " "]
  ])("rejects invalid %s without write", async (field, value) => {
    const s = await setup()
    await s.loaded()
    await s.valid()
    await s.fill(field, value)
    await s.submit()
    expect(s.create).not.toHaveBeenCalled()
    expect(s.dialog().querySelector("hlm-field-error")).not.toBeNull()
  })
  it("allows type 50 and long detail with no invented maxlength or type catalog", async () => {
    const s = await setup()
    await s.loaded()
    await s.valid()
    await s.fill("type", "a".repeat(50))
    await s.fill("detail", "x".repeat(12000))
    await s.submit()
    expect(s.create).toHaveBeenCalledExactlyOnceWith(7, {
      propertyId: null,
      type: "a".repeat(50),
      detail: "x".repeat(12000),
      isActive: true
    })
    expect(s.dialog().querySelector("#preference-type")?.tagName).toBe("INPUT")
    expect(s.dialog().querySelector("#preference-detail")?.hasAttribute("maxlength")).toBe(false)
  })
  it.each(["pending", "failed"])(
    "allows general when property choices %s, without fabricated verified empty choices",
    async mode => {
      const s = await setup(),
        pending = new Subject<Result<readonly Property[], CustomerError>>()
      s.properties.mockReturnValueOnce(
        mode === "pending" ? pending : of(Result.failure(new CustomerError("FORBIDDEN")))
      )
      await s.loaded()
      await s.valid()
      expect(s.dialog().querySelectorAll("select option")).toHaveLength(1)
      expect(s.dialog().textContent).toContain(
        mode === "pending" ? "Cargando propiedades" : "No se pudieron consultar las propiedades"
      )
      await s.submit()
      expect(s.create).toHaveBeenCalledOnce()
    }
  )
  it("retains unknown association without inventing name/null, blocks save until explicit general choice", async () => {
    const s = await setup()
    s.read.mockReturnValueOnce(
      of(Result.success([CustomerPreference.create(9, 7, 99, "Tipo", "Detalle", false)]))
    )
    await s.loaded()
    expect(s.list().textContent).toContain("ID 99")
    await s.click("Editar preferencia 9")
    expect(s.dialog().textContent).toContain("ID 99")
    expect(s.dialog().querySelector<HTMLSelectElement>("select")!.value).not.toBe("general")
    await s.submit()
    expect(s.update).not.toHaveBeenCalled()
    await s.fill("propertyId", "general")
    await s.submit()
    expect(s.update).toHaveBeenCalledExactlyOnceWith(7, {
      id: 9,
      propertyId: null,
      type: "Tipo",
      detail: "Detalle",
      isActive: false
    })
  })
  it("uses live verified owner choices, never another owner or invalid ID, and exposes stale property feedback", async () => {
    const s = await setup()
    await s.loaded()
    await s.valid()
    await s.fill("propertyId", "12")
    s.properties.mockReturnValueOnce(of(Result.failure(new CustomerError("NETWORK"))))
    TestBed.inject(CustomerPropertiesStore).loadProperties(7, true).subscribe()
    await s.settle()
    expect(s.dialog().textContent).toContain("desactualizadas")
    s.properties.mockReturnValueOnce(of(Result.success([property(12, 8), property(0)])))
    TestBed.inject(CustomerPropertiesStore).loadProperties(7, true).subscribe()
    await s.settle()
    await s.submit()
    expect(s.create).not.toHaveBeenCalled()
    expect(s.dialog().querySelector<HTMLSelectElement>("select")!.value).not.toBe("general")
    await s.fill("propertyId", "general")
    await s.submit()
    expect(s.create).toHaveBeenCalledOnce()
  })
  it.each([
    "FORBIDDEN",
    "CONFLICT",
    "NETWORK",
    "NOT_FOUND",
    "INVALID_RESPONSE",
    "INVALID_INPUT"
  ] as CustomerErrorCode[])(
    "retains safe draft after %s without feedback/reload/replay",
    async code => {
      const s = await setup()
      await s.loaded()
      await s.valid()
      await s.submit()
      s.response.next(Result.failure(new CustomerError(code)))
      await s.settle()
      expect(s.dialog().querySelector<HTMLInputElement>("#preference-type")!.value).toBe(" Libre ")
      expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
      expect(s.dialog().textContent).not.toContain(new CustomerError(code).message)
      expect(s.create).toHaveBeenCalledOnce()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read).toHaveBeenCalledTimes(1)
    }
  )
  it("keeps rows and stale error after failed success revalidation without replay", async () => {
    const s = await setup()
    await s.loaded()
    await s.valid()
    await s.submit()
    s.read.mockReturnValueOnce(of(Result.failure(new CustomerError("NETWORK"))))
    s.response.next(Result.success(general))
    await s.settle()
    expect(s.success).toHaveBeenCalledOnce()
    expect(s.read).toHaveBeenCalledTimes(2)
    expect(s.list().textContent).toContain(general.detail)
    expect(s.list().textContent).toContain("desactualizados")
    expect(s.create).toHaveBeenCalledOnce()
  })
  it("blocks pending duplicate/dismissal and one overlay, allows idle Escape after failure", async () => {
    const s = await setup()
    await s.loaded()
    await s.valid()
    await s.submit()
    await s.submit()
    await s.click("Nueva preferencia")
    expect(document.querySelectorAll("app-preference-editor")).toHaveLength(1)
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
  it.each(["Cancelar", "outside", "backdrop"])("allows idle %s without write", async action => {
    const s = await setup()
    await s.loaded()
    await s.valid()
    if (action === "Cancelar") await s.click(action, s.dialog())
    else if (action === "outside") document.body.click()
    else getDebugNode(s.dialog())!.injector.get(CdkDialogRef).overlayRef.backdropElement!.click()
    await s.settle()
    expect(s.dialog()).toBeNull()
    expect(s.create).not.toHaveBeenCalled()
  })
  it.each(["owner", "destroy", "replacement", "logout", "dialog", "closing"])(
    "synchronously cancels/fences pending write on %s",
    async reason => {
      const s = await setup()
      await s.loaded()
      await s.valid()
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
      s.response.next(Result.success(general))
      if (reason !== "destroy") await s.settle()
      expect(s.response.observed).toBe(false)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read.mock.calls.filter(([id]) => id === 7)).toHaveLength(1)
      if (reason === "owner") expect(s.list().textContent).not.toContain(general.detail)
    }
  )
  it.each(["owner", "destroy", "replacement", "logout"])(
    "cancels pending reads on %s",
    async reason => {
      const s = await setup(),
        pending = new Subject<Read>()
      s.read.mockReturnValueOnce(pending)
      await s.loaded()
      expect(pending.observed).toBe(true)
      if (reason === "destroy") s.fixture.destroy()
      else if (reason === "owner") s.params.next(convertToParamMap({ id: "8" }))
      else
        s.session.next(
          reason === "logout"
            ? null
            : AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8)
        )
      if (reason !== "destroy") await s.settle()
      expect(pending.observed).toBe(false)
    }
  )
  it("preserves same-session renewal and captured preference across refresh", async () => {
    const s = await setup()
    await s.loaded()
    await s.click("Editar preferencia 3")
    s.read.mockReturnValueOnce(of(Result.success([])))
    TestBed.inject(CustomerRelationsStore).loadPreferences(7, true).subscribe()
    await s.settle()
    await s.submit()
    expect(s.update).toHaveBeenCalledExactlyOnceWith(7, {
      id: 3,
      propertyId: null,
      type: general.type,
      detail: general.detail,
      isActive: false
    })
    const c = s.session.value!
    s.session.next(AuthSession.create(c.name, c.email, c.role, c.expiresAt, c.id))
    await s.settle()
    expect(s.response.observed).toBe(true)
    s.response.next(Result.success(general))
    await s.settle()
    expect(s.success).toHaveBeenCalledOnce()
  })
  it("dispatches no SSR reads", async () => {
    const s = await setup(true)
    expect(s.read).not.toHaveBeenCalled()
    expect(s.get).not.toHaveBeenCalled()
  })
})
