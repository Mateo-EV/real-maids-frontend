import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router"
import { BehaviorSubject, Subject, of } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HotToastService } from "@ngxpert/hot-toast"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { customerFixture } from "../../../domain/customer.fixture"
import { Property } from "../../../domain/entities/property.entity"
import { CustomerError, CustomerErrorCode } from "../../../domain/errors/customer.error"
import { GetCustomerByIdUseCase } from "../../../application/use-cases/get-customer-by-id.use-case"
import {
  CreatePropertyUseCase,
  ListCustomerPropertiesUseCase,
  SetPropertyStatusUseCase,
  UpdatePropertyUseCase
} from "../../../application/use-cases/property.use-cases"
import { CustomerHistoryStore } from "../../state/customer-history.store"
import { CustomerDetailPage } from "../../pages/customer-detail-page/customer-detail-page"

const property = Property.create(
  3,
  7,
  "Casa",
  "Dirección",
  "Ciudad",
  "Región",
  "ABC 12",
  "123456.70",
  0,
  null,
  "Instrucción ficticia",
  "Código ficticio",
  true,
  false,
  new Date("2026-01-01T00:00:00Z")
)
const blank = {
  alias: null,
  address: "Dirección nueva",
  city: null,
  region: null,
  postalCode: null,
  areaM2: null,
  roomCount: null,
  bathroomCount: null,
  accessInstructions: null,
  doorCode: null,
  hasPets: false
}
async function setup() {
  const response = new Subject<Result<Property, CustomerError>>()
  const create = vi.fn(() => response),
    update = vi.fn(() => response),
    status = vi.fn()
  const read = vi.fn(() => of(Result.success([property])))
  const success = vi.fn(),
    invalidateCustomer = vi.fn()
  const params = new BehaviorSubject(convertToParamMap({ id: "7" }))
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "test@example.test", null, Date.now() + 600000, 7)
  )
  TestBed.configureTestingModule({
    imports: [CustomerDetailPage],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: params,
          queryParamMap: of(convertToParamMap({})),
          snapshot: { queryParamMap: convertToParamMap({}) }
        }
      },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      { provide: HotToastService, useValue: { success } },
      { provide: CustomerHistoryStore, useValue: { invalidateCustomer } },
      {
        provide: GetCustomerByIdUseCase,
        useValue: {
          execute: (id: number) => of(Result.success(customerFixture(id, `Cliente ${id}`)))
        }
      },
      { provide: ListCustomerPropertiesUseCase, useValue: { execute: read } },
      { provide: CreatePropertyUseCase, useValue: { execute: create } },
      { provide: UpdatePropertyUseCase, useValue: { execute: update } },
      { provide: SetPropertyStatusUseCase, useValue: { execute: status } }
    ]
  })
  const fixture = TestBed.createComponent(CustomerDetailPage),
    root = fixture.nativeElement as HTMLElement
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const dialog = () => document.querySelector<HTMLElement>("app-property-editor")!
  const click = async (label: string, within: ParentNode = root) => {
    const b = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label
    )
    expect(b, label).toBeDefined()
    b!.click()
    await settle()
  }
  const fill = async (field: string, value: string) => {
    const input = dialog().querySelector<HTMLInputElement>(`#property-${field}`)!
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
  await settle()
  return {
    fixture,
    root,
    settle,
    dialog,
    click,
    fill,
    submit,
    create,
    update,
    status,
    read,
    response,
    success,
    params,
    session,
    invalidateCustomer
  }
}
afterEach(() => vi.restoreAllMocks())
describe("WP4 property create/edit public UI", () => {
  it("creates exact full replacement with nullable blanks and captured owner; one refresh only after confirmed success", async () => {
    const s = await setup()
    await s.click("Nueva propiedad")
    expect(s.dialog().textContent).toContain("Cliente 7")
    await s.fill("address", "  Dirección nueva  ")
    await s.submit()
    expect(s.create).toHaveBeenCalledExactlyOnceWith(7, blank)
    expect(s.read).toHaveBeenCalledTimes(1)
    expect(s.success).not.toHaveBeenCalled()
    s.response.next(Result.success(property))
    await s.settle()
    expect(s.read).toHaveBeenCalledTimes(2)
    expect(s.read).toHaveBeenLastCalledWith(7)
    expect(s.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(7)
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Propiedad creada correctamente.")
    expect(s.root.textContent).toContain("Casa")
    expect(s.status).not.toHaveBeenCalled()
  })
  it("edits a legitimately loaded inactive property, retains decimal text/zero/sensitive inputs and sends no lifecycle metadata", async () => {
    const s = await setup()
    await s.click("Editar propiedad Casa")
    expect(s.dialog().querySelector<HTMLInputElement>("#property-areaM2")!.value).toBe("123456.70")
    expect(s.dialog().querySelector<HTMLInputElement>("#property-doorCode")!.value).toBe(
      property.doorCode
    )
    expect(s.root.querySelector("summary")!.textContent).not.toContain(property.doorCode)
    await s.fill("alias", " ")
    await s.fill("bathroomCount", "0")
    await s.fill("city", "")
    await s.submit()
    expect(s.update).toHaveBeenCalledExactlyOnceWith(7, {
      id: 3,
      alias: null,
      address: property.address,
      city: null,
      region: property.region,
      postalCode: property.postalCode,
      areaM2: "123456.70",
      roomCount: 0,
      bathroomCount: 0,
      accessInstructions: property.accessInstructions,
      doorCode: property.doorCode,
      hasPets: true
    })
    expect(s.status).not.toHaveBeenCalled()
    s.response.next(Result.success(property))
    await s.settle()
    expect(s.success).toHaveBeenCalledExactlyOnceWith("Propiedad actualizada correctamente.")
    expect(s.read).toHaveBeenCalledTimes(2)
  })
  it.each([
    ["address", " "],
    ["address", "a".repeat(201)],
    ["alias", "a".repeat(81)],
    ["city", "a".repeat(81)],
    ["region", "a".repeat(81)],
    ["postalCode", "a".repeat(16)],
    ["postalCode", "!!"],
    ["accessInstructions", "a".repeat(2001)],
    ["doorCode", "a".repeat(31)],
    ["areaM2", "0.99"],
    ["areaM2", "1000000"],
    ["areaM2", "1.001"],
    ["areaM2", "1e2"],
    ["areaM2", "1,20"],
    ["roomCount", "201"],
    ["roomCount", "-1"],
    ["roomCount", "1.5"],
    ["bathroomCount", "101"],
    ["bathroomCount", "-1"]
  ])("rejects invalid %s %s declaratively, without dispatch", async (field, value) => {
    const s = await setup()
    await s.click("Nueva propiedad")
    await s.fill("address", "Válida")
    await s.fill(field, value)
    await s.submit()
    expect(s.create).not.toHaveBeenCalled()
    expect(s.dialog().querySelector("hlm-field-error")).not.toBeNull()
  })
  it("accepts exact field and numeric limits, preserving decimal scale and boolean choice", async () => {
    const s = await setup()
    await s.click("Nueva propiedad")
    for (const [field, value] of Object.entries({
      address: "a".repeat(200),
      alias: "a".repeat(80),
      city: "a".repeat(80),
      region: "a".repeat(80),
      postalCode: "a".repeat(15),
      accessInstructions: "a".repeat(2000),
      doorCode: "a".repeat(30),
      areaM2: "999999.99",
      roomCount: "200",
      bathroomCount: "100"
    }))
      await s.fill(field, value)
    const pets = s.dialog().querySelector<HTMLInputElement>("#property-hasPets")!
    pets.click()
    await s.settle()
    await s.submit()
    expect(s.create).toHaveBeenCalledOnce()
    expect(s.create.mock.calls[0]).toEqual([
      7,
      expect.objectContaining({
        areaM2: "999999.99",
        roomCount: 200,
        bathroomCount: 100,
        hasPets: true
      })
    ])
  })
  it.each(["FORBIDDEN", "CONFLICT", "NETWORK", "PROPERTY_NOT_FOUND"] as CustomerErrorCode[])(
    "preserves draft on %s with safe inline feedback and no automatic retry/refresh/toast",
    async code => {
      const s = await setup()
      await s.click("Editar propiedad Casa")
      await s.fill("address", "Borrador")
      await s.submit()
      s.response.next(Result.failure(new CustomerError(code)))
      await s.settle()
      expect(s.dialog().querySelector<HTMLInputElement>("#property-address")!.value).toBe(
        "Borrador"
      )
      expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read).toHaveBeenCalledTimes(1)
      expect(s.update).toHaveBeenCalledOnce()
    }
  )
  it("blocks pending duplicate submit/Cancel/Escape/backdrop/outside, then permits idle dismissal", async () => {
    const s = await setup()
    await s.click("Nueva propiedad")
    await s.fill("address", "Válida")
    await s.submit()
    await s.submit()
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
    expect(s.create).toHaveBeenCalledOnce()
    s.response.next(Result.failure(new CustomerError("NETWORK")))
    await s.settle()
    s.dialog().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    await s.settle()
    expect(s.dialog()).toBeNull()
  })
  it.each(["Cancelar", "backdrop", "outside"])("allows idle %s", async action => {
    const s = await setup()
    await s.click("Nueva propiedad")
    const cdk = getDebugNode(s.dialog())!.injector.get(CdkDialogRef)
    if (action === "Cancelar") await s.click(action, s.dialog())
    else if (action === "backdrop") cdk.overlayRef.backdropElement!.click()
    else document.body.click()
    await s.settle()
    expect(s.dialog()).toBeNull()
    expect(s.create).not.toHaveBeenCalled()
  })
  it.each(["destroy", "owner", "replacement", "logout", "dialog"])(
    "cancels and fences stale writes/feedback/refresh on %s",
    async reason => {
      const s = await setup()
      await s.click("Nueva propiedad")
      await s.fill("address", "Válida")
      await s.submit()
      expect(s.response.observed).toBe(true)
      if (reason === "destroy") s.fixture.destroy()
      else if (reason === "owner") s.params.next(convertToParamMap({ id: "8" }))
      else if (reason === "dialog") getDebugNode(s.dialog())!.injector.get(CdkDialogRef).close()
      else
        s.session.next(
          reason === "logout"
            ? null
            : AuthSession.create("Other", "other@example.test", null, Date.now() + 600000, 8)
        )
      if (reason !== "destroy") await s.settle()
      expect(s.response.observed).toBe(false)
      const reads = s.read.mock.calls.length
      s.response.next(Result.success(property))
      if (reason !== "destroy") await s.settle()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read).toHaveBeenCalledTimes(reads)
    }
  )
  it("preserves same-session renewal through confirmed success", async () => {
    const s = await setup()
    await s.click("Nueva propiedad")
    await s.fill("address", "Válida")
    await s.submit()
    const c = s.session.value!
    s.session.next(AuthSession.create(c.name, c.email, c.role, c.expiresAt, c.id))
    await s.settle()
    expect(s.response.observed).toBe(true)
    s.response.next(Result.success(property))
    await s.settle()
    expect(s.success).toHaveBeenCalledOnce()
    expect(s.read).toHaveBeenCalledTimes(2)
  })
})
