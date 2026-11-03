import { PLATFORM_ID } from "@angular/core"
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
import { CustomerHistory } from "../../../domain/entities/customer-history"
import { Property } from "../../../domain/entities/property.entity"
import { CustomerContact } from "../../../domain/entities/customer-contact.entity"
import { CustomerPreference } from "../../../domain/entities/customer-preference.entity"
import { CustomerError } from "../../../domain/errors/customer.error"
import { GetCustomerByIdUseCase } from "../../../application/use-cases/get-customer-by-id.use-case"
import { GetCustomerHistoryUseCase } from "../../../application/use-cases/get-customer-history.use-case"
import {
  CreatePropertyUseCase,
  ListCustomerPropertiesUseCase,
  SetPropertyStatusUseCase,
  UpdatePropertyUseCase
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
import { CustomerDetailPage } from "./customer-detail-page"

const stamp = new Date("2026-01-01T00:00:00Z")
const property = Property.create(
  3,
  7,
  "Casa",
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
  stamp
)
const contact = CustomerContact.create(3, 7, "Contacto", null, null, null, false, true)
const preference = CustomerPreference.create(3, 7, null, "Tipo", "Detalle", true)
const history = (owner = 7): CustomerHistory => ({
  customer: customerFixture(owner, `Cliente ${owner}`),
  requests: {
    items: [
      {
        id: 9,
        customerId: owner,
        customer: "Cliente",
        propertyId: 3,
        property: "Casa",
        serviceTypeId: 2,
        serviceType: "Limpieza",
        description: null,
        desiredDate: null,
        status: "Registrada",
        registeredBy: null,
        registeredAt: stamp,
        updatedAt: null
      }
    ],
    total: 42,
    offset: 0,
    limit: 20
  },
  orders: {
    items: [
      {
        id: 4,
        code: "ORD-4",
        status: "PROGRAMADA",
        statusName: "Programada",
        requestId: null,
        customerId: owner,
        customer: "Cliente",
        propertyId: 3,
        property: "Casa",
        serviceTypeId: null,
        serviceType: null,
        estimatedMinutes: null,
        estimatedAmount: "99999999.90",
        observation: "<b>Texto plano</b>",
        schedule: null,
        assignees: [],
        createdAt: stamp,
        updatedAt: null
      }
    ],
    total: 8,
    offset: 0,
    limit: 20
  },
  support: { items: [], total: 0, offset: 0, limit: 20 }
})
type Read = Result<CustomerHistory, CustomerError>
async function setup(server = false) {
  const params = new BehaviorSubject(convertToParamMap({ id: "7" }))
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "test@example.test", null, Date.now() + 600000, 7)
  )
  const read = vi.fn((owner: number, _limit?: number): Observable<Read> =>
    of(Result.success(history(owner)))
  )
  const properties = vi.fn(() => of(Result.success([property])))
  const contacts = vi.fn(() => of(Result.success([contact])))
  const preferences = vi.fn(() => of(Result.success([preference])))
  const propertyResponse = new Subject<Result<Property, CustomerError>>()
  const contactResponse = new Subject<Result<CustomerContact, CustomerError>>()
  const preferenceResponse = new Subject<Result<CustomerPreference, CustomerError>>()
  const propertyWrite = vi.fn(() => propertyResponse),
    contactWrite = vi.fn(() => contactResponse),
    preferenceWrite = vi.fn(() => preferenceResponse)
  const success = vi.fn()
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
      {
        provide: GetCustomerByIdUseCase,
        useValue: {
          execute: (id: number) => of(Result.success(customerFixture(id, `Cliente ${id}`)))
        }
      },
      { provide: GetCustomerHistoryUseCase, useValue: { execute: read } },
      { provide: ListCustomerPropertiesUseCase, useValue: { execute: properties } },
      ...[CreatePropertyUseCase, UpdatePropertyUseCase, SetPropertyStatusUseCase].map(provide => ({
        provide,
        useValue: { execute: propertyWrite }
      })),
      { provide: ListCustomerContactsUseCase, useValue: { execute: contacts } },
      { provide: ListCustomerPreferencesUseCase, useValue: { execute: preferences } },
      ...[CreateCustomerContactUseCase, UpdateCustomerContactUseCase].map(provide => ({
        provide,
        useValue: { execute: contactWrite }
      })),
      ...[CreateCustomerPreferenceUseCase, UpdateCustomerPreferenceUseCase].map(provide => ({
        provide,
        useValue: { execute: preferenceWrite }
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
  const disclosure = () =>
    [...root.querySelectorAll("details")].find(d =>
      d.querySelector("summary")?.textContent?.includes("Historial")
    )!
  const toggle = async (open: boolean) => {
    expect(disclosure(), "history disclosure").toBeDefined()
    disclosure().open = open
    disclosure().dispatchEvent(new Event("toggle"))
    await settle()
  }
  const click = async (label: string, within: ParentNode = root) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const panel = () => root.querySelector("app-customer-history-panel")!
  await settle()
  return {
    fixture,
    root,
    settle,
    toggle,
    disclosure,
    click,
    panel,
    read,
    params,
    session,
    properties,
    contacts,
    preferences,
    propertyResponse,
    contactResponse,
    preferenceResponse,
    propertyWrite,
    contactWrite,
    preferenceWrite,
    success
  }
}
afterEach(() => vi.restoreAllMocks())

describe("WP5 lazy official history", () => {
  it("does not read before disclosure, uses owner/20 and reuses fresh cache on reopening", async () => {
    const s = await setup()
    expect(s.read).not.toHaveBeenCalled()
    expect(s.panel()).toBeNull()
    await s.toggle(true)
    expect(s.read).toHaveBeenCalledExactlyOnceWith(7, 20)
    await s.toggle(false)
    expect(s.panel()).toBeNull()
    await s.toggle(true)
    expect(s.read).toHaveBeenCalledTimes(1)
    expect(s.root.querySelector("a")?.getAttribute("href")).toBe(
      "/admin/customers?offset=10&limit=5"
    )
  })
  it("checks 30s TTL and invalidation only on reopen, without polling", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1000)
    const s = await setup()
    await s.toggle(true)
    await s.toggle(false)
    vi.mocked(Date.now).mockReturnValue(31000)
    expect(s.read).toHaveBeenCalledTimes(1)
    await s.toggle(true)
    expect(s.read).toHaveBeenCalledTimes(2)
    await s.toggle(false)
    TestBed.inject(CustomerHistoryStore).invalidateCustomer(7)
    expect(s.read).toHaveBeenCalledTimes(2)
    await s.toggle(true)
    expect(s.read).toHaveBeenCalledTimes(3)
  })
  it("keeps independent module ranges/totals, response order, known nulls and canonical amount as plain text", async () => {
    const s = await setup()
    const value = history()
    s.read.mockReturnValueOnce(
      of(
        Result.success({
          ...value,
          requests: {
            ...value.requests,
            items: [value.requests.items[0], { ...value.requests.items[0], id: 2 }]
          },
          support: {
            ...value.support,
            items: [
              {
                id: 5,
                customerId: 7,
                customer: "Cliente",
                orderId: null,
                orderCode: null,
                typeId: 2,
                type: "Consulta",
                requiresResponse: false,
                status: "RECIBIDA",
                statusName: "Recibida",
                subject: "Asunto",
                description: "<img src=x>",
                registeredAt: stamp,
                closedAt: null
              }
            ],
            total: 3
          }
        })
      )
    )
    await s.toggle(true)
    const text = s.panel().textContent!
    for (const label of [
      "Solicitudes de servicio",
      "Órdenes de servicio",
      "Atención al cliente",
      "1–2 de 42",
      "1–1 de 8",
      "1–1 de 3",
      "99999999.90",
      "No registrado",
      "<b>Texto plano</b>",
      "<img src=x>"
    ])
      expect(text).toContain(label)
    expect(text.indexOf("Solicitud #9")).toBeLessThan(text.indexOf("Solicitud #2"))
    expect(s.panel().querySelector("b, img, a, table")).toBeNull()
    expect(text).not.toMatch(/restringid|actividad total|total de actividad/i)
  })
  it("labels returned empty pages and own zero total without inferring authorization or all-history absence", async () => {
    const s = await setup()
    await s.toggle(true)
    const support = [...s.panel().querySelectorAll("section")].find(e =>
      e.textContent?.includes("Atención al cliente")
    )!
    expect(support.textContent).toContain("0–0 de 0")
    expect(support.textContent).toContain("No se devolvieron registros")
    expect(support.textContent).not.toMatch(/restringid|sin permiso|no existe historial/i)
  })
  it.each(["FORBIDDEN", "INVALID_RESPONSE"] as const)(
    "shows one safe overall %s failure, never three false empties; retry forces read and keeps same-key stale data",
    async code => {
      const s = await setup()
      s.read.mockReturnValueOnce(of(Result.failure(new CustomerError(code))))
      await s.toggle(true)
      expect(s.panel().querySelectorAll('[role="alert"]')).toHaveLength(1)
      expect(s.panel().textContent).not.toContain("No se devolvieron registros")
      expect(s.panel().textContent).not.toContain("0–0 de 0")
      await s.click("Reintentar historial")
      expect(s.read).toHaveBeenCalledTimes(2)
      const pending = new Subject<Read>()
      s.read.mockReturnValueOnce(pending)
      TestBed.inject(CustomerHistoryStore).invalidateCustomer(7)
      await s.toggle(false)
      await s.toggle(true)
      expect(s.panel().textContent).toContain("Actualizando historial")
      expect(s.panel().textContent).toContain("ORD-4")
      pending.next(Result.failure(new CustomerError(code)))
      pending.complete()
      await s.settle()
      expect(s.panel().textContent).toContain("desactualizados")
      expect(s.panel().textContent).toContain("ORD-4")
      await s.click("Reintentar historial")
      expect(s.read).toHaveBeenCalledTimes(4)
    }
  )
  it.each(["close", "owner", "logout", "replacement", "destroy"])(
    "cancels pending read on %s and prevents old rendered context",
    async reason => {
      const s = await setup(),
        pending = new Subject<Read>()
      s.read.mockReturnValueOnce(pending)
      await s.toggle(true)
      expect(pending.observed).toBe(true)
      if (reason === "close") await s.toggle(false)
      else if (reason === "owner") {
        s.params.next(convertToParamMap({ id: "8" }))
        expect(pending.observed).toBe(false)
        await s.settle()
      } else if (reason === "destroy") s.fixture.destroy()
      else {
        const c = s.session.value!
        s.session.next(
          reason === "logout"
            ? null
            : AuthSession.create("Other", "other@example.test", null, c.expiresAt, 8)
        )
        await s.settle()
      }
      expect(pending.observed).toBe(false)
      pending.next(Result.success(history()))
      if (reason !== "destroy") {
        await s.settle()
        expect(s.panel()).toBeNull()
        expect(s.root.textContent).not.toContain("ORD-4")
      }
      if (reason === "owner") {
        await s.toggle(true)
        expect(s.read).toHaveBeenLastCalledWith(8, 20)
      }
    }
  )
  it("preserves same-session renewal and dispatches no SSR reads", async () => {
    const s = await setup(),
      pending = new Subject<Read>()
    s.read.mockReturnValueOnce(pending)
    await s.toggle(true)
    const c = s.session.value!
    s.session.next(AuthSession.create(c.name, c.email, c.role, c.expiresAt, c.id))
    await s.settle()
    expect(pending.observed).toBe(true)
    pending.next(Result.success(history()))
    pending.complete()
    await s.settle()
    expect(s.panel().textContent).toContain("ORD-4")
  })
  it("does not dispatch any history during SSR", async () => {
    const s = await setup(true)
    expect(s.read).not.toHaveBeenCalled()
    expect(s.panel()).toBeNull()
  })

  it.each(["toast-owner", "list-owner", "refresh-failure", "native-closed"])(
    "fences confirmed-contact feedback steps on %s without replay or duplicate reads",
    async transition => {
      const s = await setup()
      await s.toggle(true)
      await s.click("Nuevo contacto")
      const dialog = document.querySelector<HTMLElement>("app-contact-editor")!
      const name = dialog.querySelector<HTMLInputElement>("#contact-name")!
      name.value = "Nuevo"
      name.dispatchEvent(new Event("input", { bubbles: true }))
      await s.settle()
      dialog
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
      await s.settle()
      if (transition === "toast-owner")
        s.success.mockImplementationOnce(() => s.params.next(convertToParamMap({ id: "8" })))
      if (transition === "list-owner")
        s.contacts.mockImplementationOnce(() => {
          s.params.next(convertToParamMap({ id: "8" }))
          return of(Result.success([]))
        })
      if (transition === "refresh-failure")
        s.read.mockReturnValueOnce(of(Result.failure(new CustomerError("INVALID_RESPONSE"))))
      if (transition === "native-closed") s.disclosure().open = false
      s.contactResponse.next(Result.success(contact))
      await s.settle()
      expect(s.contactWrite).toHaveBeenCalledOnce()
      expect(s.read).toHaveBeenCalledTimes(transition === "refresh-failure" ? 2 : 1)
      if (transition === "refresh-failure") {
        expect(s.panel().textContent).toContain("ORD-4")
        expect(s.panel().textContent).toContain("desactualizados")
        await s.click("Reintentar historial")
        expect(s.read).toHaveBeenCalledTimes(3)
        expect(s.contactWrite).toHaveBeenCalledOnce()
      }
    }
  )

  for (const action of [
    "property-create",
    "property-edit",
    "property-status",
    "contact-create",
    "contact-edit",
    "preference-create",
    "preference-edit"
  ]) {
    it.each(["open", "closed", "failed"])(
      `${action}: exactly one visible history refresh after success, none when %s/failed, own-list read stays single`,
      async mode => {
        const s = await setup()
        if (mode !== "closed") await s.toggle(true)
        const isProperty = action.startsWith("property"),
          isContact = action.startsWith("contact")
        const launch =
          action === "property-create"
            ? "Nueva propiedad"
            : action === "property-edit"
              ? "Editar propiedad Casa"
              : action === "property-status"
                ? "Desactivar propiedad Casa"
                : action === "contact-create"
                  ? "Nuevo contacto"
                  : action === "contact-edit"
                    ? "Editar contacto Contacto"
                    : action === "preference-create"
                      ? "Nueva preferencia"
                      : "Editar preferencia 3"
        await s.click(launch)
        const dialog = document.querySelector<HTMLElement>(
          action === "property-status"
            ? "app-property-status-dialog"
            : isProperty
              ? "app-property-editor"
              : isContact
                ? "app-contact-editor"
                : "app-preference-editor"
        )!
        expect(dialog).not.toBeNull()
        const fill = async (id: string, value: string) => {
          const input = dialog.querySelector<HTMLInputElement>(`#${id}`)!
          input.value = value
          input.dispatchEvent(new Event("input", { bubbles: true }))
          input.dispatchEvent(new Event("blur"))
          await s.settle()
        }
        if (action === "property-create") await fill("property-address", "Dirección")
        if (action === "contact-create") await fill("contact-name", "Nuevo")
        if (action === "preference-create") {
          await fill("preference-type", "Tipo")
          await fill("preference-detail", "Detalle")
        }
        if (action === "property-status") await s.click("Confirmar desactivación", dialog)
        else {
          dialog
            .querySelector("form")!
            .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
          await s.settle()
        }
        const before = mode === "closed" ? 0 : 1
        expect(s.read).toHaveBeenCalledTimes(before)
        if (isProperty)
          s.propertyResponse.next(
            mode === "failed"
              ? Result.failure(new CustomerError("FORBIDDEN"))
              : Result.success(property)
          )
        else if (isContact)
          s.contactResponse.next(
            mode === "failed"
              ? Result.failure(new CustomerError("FORBIDDEN"))
              : Result.success(contact)
          )
        else
          s.preferenceResponse.next(
            mode === "failed"
              ? Result.failure(new CustomerError("FORBIDDEN"))
              : Result.success(preference)
          )
        await s.settle()
        expect(s.read).toHaveBeenCalledTimes(before + (mode === "open" ? 1 : 0))
        expect(s.properties).toHaveBeenCalledTimes(1 + (mode !== "failed" && isProperty ? 1 : 0))
        expect(s.contacts).toHaveBeenCalledTimes(1 + (mode !== "failed" && isContact ? 1 : 0))
        expect(s.preferences).toHaveBeenCalledTimes(
          1 + (mode !== "failed" && !isProperty && !isContact ? 1 : 0)
        )
        expect(
          isProperty ? s.propertyWrite : isContact ? s.contactWrite : s.preferenceWrite
        ).toHaveBeenCalledTimes(1)
        if (mode === "closed") {
          await s.toggle(true)
          expect(s.read).toHaveBeenCalledExactlyOnceWith(7, 20)
        }
      }
    )
  }
})
