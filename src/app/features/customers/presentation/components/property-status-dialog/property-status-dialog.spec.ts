import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router"
import { BehaviorSubject, Observable, Subject, of } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { BrnDialogRef } from "@spartan-ng/brain/dialog"
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
  UpdatePropertyUseCase,
  ListCustomerPropertiesUseCase,
  SetPropertyStatusUseCase
} from "../../../application/use-cases/property.use-cases"
import { CustomerHistoryStore } from "../../state/customer-history.store"
import { CustomerRelationsStore } from "../../state/customer-relations.store"
import { CustomerDetailPage } from "../../pages/customer-detail-page/customer-detail-page"

const property = (active: boolean, owner = 7) =>
  Property.create(
    3,
    owner,
    "Casa",
    "Dirección",
    null,
    null,
    null,
    null,
    null,
    null,
    "Instrucción ficticia",
    "Código ficticio",
    false,
    active,
    new Date("2026-01-01T00:00:00Z")
  )
async function setup(active = false, owner = 7) {
  const response = new Subject<Result<Property, CustomerError>>()
  const status = vi.fn(() => response)
  const read = vi.fn((): Observable<Result<readonly Property[], CustomerError>> =>
    of(Result.success([property(active, owner)]))
  )
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
        provide: CustomerRelationsStore,
        useValue: {
          selectContacts: () => ({ data: [], loaded: true, pendingReads: 0 }),
          loadContacts: () => of(Result.success([])),
          pendingContactWrites: () => 0,
          selectPreferences: () => ({ data: [], loaded: true, pendingReads: 0 }),
          loadPreferences: () => of(Result.success([])),
          pendingPreferenceWrites: () => 0
        }
      },
      {
        provide: GetCustomerByIdUseCase,
        useValue: {
          execute: (id: number) => of(Result.success(customerFixture(id, `Cliente ${id}`)))
        }
      },
      { provide: ListCustomerPropertiesUseCase, useValue: { execute: read } },
      { provide: CreatePropertyUseCase, useValue: { execute: vi.fn() } },
      { provide: UpdatePropertyUseCase, useValue: { execute: vi.fn() } },
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
  const dialog = () => document.querySelector<HTMLElement>("app-property-status-dialog")!
  const click = async (label: string, within: ParentNode = root) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const open = () => click(`${active ? "Desactivar" : "Activar"} propiedad Casa`)
  const confirm = () => click(active ? "Confirmar desactivación" : "Confirmar activación", dialog())
  await settle()
  return {
    fixture,
    root,
    settle,
    dialog,
    click,
    open,
    confirm,
    response,
    status,
    read,
    success,
    params,
    session,
    invalidateCustomer
  }
}
afterEach(() => vi.restoreAllMocks())
describe("WP4 property desired status public UI", () => {
  it.each([false, true])(
    "confirms captured owner/property and explicit desired state from active=%s, with one toast/read only after success",
    async active => {
      const s = await setup(active)
      await s.open()
      expect(s.status).not.toHaveBeenCalled()
      for (const value of [
        "Cliente 7",
        "#7",
        "Casa",
        "Dirección",
        "#3",
        active ? "Activa → Inactiva" : "Inactiva → Activa"
      ])
        expect(s.dialog().textContent).toContain(value)
      for (const value of [property(active).doorCode, property(active).accessInstructions]) {
        expect(s.dialog().textContent).not.toContain(value)
        expect(s.root.querySelector("summary")!.textContent).not.toContain(value)
      }
      await s.confirm()
      expect(s.status).toHaveBeenCalledExactlyOnceWith(7, 3, !active)
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read).toHaveBeenCalledTimes(1)
      s.response.next(Result.success(property(!active)))
      await s.settle()
      expect(s.success).toHaveBeenCalledExactlyOnceWith(
        active ? "Propiedad desactivada correctamente." : "Propiedad activada correctamente."
      )
      expect(s.read).toHaveBeenCalledTimes(2)
      expect(s.read).toHaveBeenLastCalledWith(7)
      expect(s.invalidateCustomer).toHaveBeenCalledExactlyOnceWith(7)
      expect(s.root.querySelectorAll("li")).toHaveLength(1)
    }
  )
  it.each([
    "FORBIDDEN",
    "CONFLICT",
    "NETWORK",
    "PROPERTY_NOT_FOUND",
    "INVALID_RESPONSE",
    "INVALID_INPUT"
  ] as CustomerErrorCode[])(
    "retains selected confirmation on %s, safe error, explicit retry only",
    async code => {
      const s = await setup()
      await s.open()
      await s.confirm()
      const error = new CustomerError(code)
      error.message = "RAW_PRIVATE_VALUE"
      s.response.next(Result.failure(error))
      await s.settle()
      expect(s.dialog().textContent).toContain("Cliente 7")
      expect(s.dialog().textContent).toContain("Inactiva → Activa")
      expect(s.dialog().querySelector('[role="alert"]')).not.toBeNull()
      expect(s.dialog().textContent).not.toContain("RAW_PRIVATE_VALUE")
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read).toHaveBeenCalledTimes(1)
      expect(s.status).toHaveBeenCalledOnce()
      await s.confirm()
      expect(s.status).toHaveBeenLastCalledWith(7, 3, true)
      expect(s.status).toHaveBeenCalledTimes(2)
    }
  )
  it("keeps captured desired state/identity when list refresh replaces the selected row", async () => {
    const s = await setup()
    await s.open()
    s.read.mockReturnValue(of(Result.success([property(true)])))
    // A public forced read refreshes the owner list; the existing confirmation stays captured.
    const { CustomerPropertiesStore } = await import("../../state/customer-properties.store")
    TestBed.inject(CustomerPropertiesStore).loadProperties(7, true).subscribe()
    await s.settle()
    expect(s.dialog().textContent).toContain("Inactiva → Activa")
    await s.confirm()
    expect(s.status).toHaveBeenCalledExactlyOnceWith(7, 3, true)
  })
  it("allows only one property dialog and retains inactive membership until server revalidation", async () => {
    const s = await setup(false)
    await s.open()
    await s.click("Nueva propiedad")
    await s.open()
    expect(document.querySelectorAll("app-property-status-dialog")).toHaveLength(1)
    expect(document.querySelector("app-property-editor")).toBeNull()
    await s.confirm()
    expect(s.root.querySelectorAll("li")).toHaveLength(1)
    expect(s.root.querySelector("summary")!.textContent).toContain("Inactiva")
    s.read.mockReturnValue(of(Result.failure(new CustomerError("NETWORK"))))
    s.response.next(Result.success(property(true)))
    await s.settle()
    expect(s.success).toHaveBeenCalledOnce()
    expect(s.status).toHaveBeenCalledOnce()
    expect(s.read).toHaveBeenCalledTimes(2)
    expect(s.root.querySelector("summary")!.textContent).toContain("Inactiva")
    expect(s.root.textContent).toContain("No se pudieron consultar las propiedades")
  })
  it("rejects a loaded property from another owner", async () => {
    const s = await setup(false, 8)
    await s.open()
    expect(s.dialog()).toBeNull()
    expect(s.status).not.toHaveBeenCalled()
  })
  it("blocks duplicate confirm and pending Cancel/Escape/backdrop/outside", async () => {
    const s = await setup()
    await s.open()
    await s.confirm()
    const cdk = getDebugNode(s.dialog())!.injector.get(CdkDialogRef)
    expect([...s.dialog().querySelectorAll("button")].every(b => b.disabled)).toBe(true)
    await s.click("Cancelar", s.dialog())
    cdk.overlayRef.backdropElement!.click()
    document.body.click()
    s.dialog().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    // Dispatching a click also exercises the handler's guard, not merely native disabled behavior.
    s.dialog()
      .querySelectorAll("button")[1]
      .dispatchEvent(new MouseEvent("click", { bubbles: true }))
    await s.settle()
    expect(s.dialog()).not.toBeNull()
    expect(s.status).toHaveBeenCalledOnce()
  })
  it.each(["Cancelar", "Escape", "backdrop", "outside"])(
    "allows idle %s without mutation",
    async action => {
      const s = await setup()
      await s.open()
      const cdk = getDebugNode(s.dialog())!.injector.get(CdkDialogRef)
      if (action === "Cancelar") await s.click(action, s.dialog())
      else if (action === "Escape")
        s.dialog().dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
        )
      else if (action === "backdrop") cdk.overlayRef.backdropElement!.click()
      else document.body.click()
      await s.settle()
      expect(s.dialog()).toBeNull()
      expect(s.status).not.toHaveBeenCalled()
    }
  )
  it.each(["owner", "replacement", "logout", "destroy", "dialog"])(
    "cancels/fences pending completion on %s",
    async reason => {
      const s = await setup()
      await s.open()
      await s.confirm()
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
      s.response.next(Result.success(property(true)))
      if (reason !== "destroy") await s.settle()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read).toHaveBeenCalledTimes(reads)
    }
  )
  it.each(["close", "owner", "logout", "destroy"])(
    "fences post-await success during closing animation / %s",
    async reason => {
      const s = await setup()
      await s.open()
      await s.confirm()
      const ref = getDebugNode(s.dialog())!.injector.get(BrnDialogRef)
      s.response.next(Result.success(property(true)))
      // Completion is queued but feedback has not run: close() can leave content mounted for animation.
      ref.close()
      if (reason === "owner") s.params.next(convertToParamMap({ id: "8" }))
      else if (reason === "logout") s.session.next(null)
      else if (reason === "destroy") s.fixture.destroy()
      const reads = s.read.mock.calls.length
      if (reason !== "destroy") await s.settle()
      else await Promise.resolve()
      expect(s.success).not.toHaveBeenCalled()
      expect(s.read).toHaveBeenCalledTimes(reads)
    }
  )
  it("preserves pending work on same-session renewal", async () => {
    const s = await setup()
    await s.open()
    await s.confirm()
    const c = s.session.value!
    s.session.next(AuthSession.create(c.name, c.email, c.role, c.expiresAt, c.id))
    await s.settle()
    expect(s.response.observed).toBe(true)
    s.response.next(Result.success(property(true)))
    await s.settle()
    expect(s.success).toHaveBeenCalledOnce()
    expect(s.read).toHaveBeenCalledTimes(2)
  })
})
