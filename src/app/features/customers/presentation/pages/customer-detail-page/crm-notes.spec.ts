import { getDebugNode, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router"
import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { BehaviorSubject, Observable, Subject, of } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HotToastService } from "@ngxpert/hot-toast"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import {
  CreateCrmNoteUseCase,
  ListCrmEmailsUseCase,
  ListCrmNotesUseCase,
  ListEmailTemplatesUseCase,
  SendCrmEmailUseCase,
  UpdateCrmNoteUseCase
} from "@/app/features/communications/application/use-cases/crm-communications.use-cases"
import { CrmNote } from "@/app/features/communications/domain/entities/crm-note.entity"
import { CommunicationsError } from "@/app/features/communications/domain/errors/communications.error"
import { customerFixture } from "../../../domain/customer.fixture"
import { Customer } from "../../../domain/entities/customer.entity"
import { CustomerError } from "../../../domain/errors/customer.error"
import { GetCustomerByIdUseCase } from "../../../application/use-cases/get-customer-by-id.use-case"
import {
  CreatePropertyUseCase,
  ListCustomerPropertiesUseCase,
  SetPropertyStatusUseCase,
  UpdatePropertyUseCase
} from "../../../application/use-cases/property.use-cases"
import {
  CreateCustomerContactUseCase,
  CreateCustomerPreferenceUseCase,
  ListCustomerContactsUseCase,
  ListCustomerPreferencesUseCase,
  UpdateCustomerContactUseCase,
  UpdateCustomerPreferenceUseCase
} from "../../../application/use-cases/customer-relations.use-cases"
import { CustomerHistoryStore } from "../../state/customer-history.store"
import { CustomerDetailPage } from "./customer-detail-page"

const date = new Date("2026-03-02T12:00:00Z")
const own = CrmNote.create(4, 7, null, "Nota de la sesión", 7, "Autora", date, null)
const other = CrmNote.create(5, 7, null, "Nota ajena", 99, "Otra persona", date, null)
type NotesRead = Result<PaginationResponse<CrmNote>, CommunicationsError>
const page = (items: CrmNote[], offset = 0, limit = 20, total = items.length): NotesRead =>
  Result.success({ items, total, offset, limit })

async function setup(server = false) {
  const profile = new Subject<Result<Customer, CustomerError>>()
  const reads: Subject<NotesRead>[] = []
  const creates: Subject<Result<CrmNote, CommunicationsError>>[] = []
  const read = vi.fn(() => {
    const request = new Subject<NotesRead>()
    reads.push(request)
    return request
  })
  const create = vi.fn(() => {
    const request = new Subject<Result<CrmNote, CommunicationsError>>()
    creates.push(request)
    return request
  })
  const success = vi.fn(),
    error = vi.fn()
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
          paramMap: new BehaviorSubject(convertToParamMap({ id: "7" })),
          queryParamMap: of(convertToParamMap({})),
          snapshot: { queryParamMap: convertToParamMap({}) }
        }
      },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
      { provide: HotToastService, useValue: { success, error } },
      { provide: CustomerHistoryStore, useValue: { invalidateCustomer: vi.fn() } },
      { provide: GetCustomerByIdUseCase, useValue: { execute: get } },
      {
        provide: ListCustomerPropertiesUseCase,
        useValue: { execute: () => of(Result.success([])) }
      },
      ...[CreatePropertyUseCase, UpdatePropertyUseCase, SetPropertyStatusUseCase].map(provide => ({
        provide,
        useValue: { execute: vi.fn() }
      })),
      {
        provide: ListCustomerContactsUseCase,
        useValue: { execute: () => of(Result.success([])) }
      },
      ...[
        CreateCustomerContactUseCase,
        UpdateCustomerContactUseCase,
        CreateCustomerPreferenceUseCase,
        UpdateCustomerPreferenceUseCase
      ].map(provide => ({ provide, useValue: { execute: vi.fn() } })),
      {
        provide: ListCustomerPreferencesUseCase,
        useValue: { execute: () => of(Result.success([])) }
      },
      { provide: ListCrmNotesUseCase, useValue: { execute: read } },
      { provide: CreateCrmNoteUseCase, useValue: { execute: create } },
      { provide: UpdateCrmNoteUseCase, useValue: { execute: () => of(Result.success(own)) } },
      {
        provide: ListCrmEmailsUseCase,
        useValue: {
          execute: () => of(Result.success({ items: [], total: 0, offset: 0, limit: 20 }))
        }
      },
      { provide: ListEmailTemplatesUseCase, useValue: { execute: () => of(Result.success([])) } },
      { provide: SendCrmEmailUseCase, useValue: { execute: vi.fn() } },
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
  const panel = () => root.querySelector<HTMLElement>("app-crm-notes")!
  const dialog = () => document.querySelector<HTMLElement>("app-note-editor")
  const click = async (label: string, within: ParentNode = root) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const loaded = async () => {
    profile.next(Result.success(customerFixture(7, "Cliente siete")))
    await settle()
  }
  const respond = async (value: NotesRead, index = reads.length - 1) => {
    reads[index].next(value)
    reads[index].complete()
    await settle()
  }
  const fill = async (value: string) => {
    const field = dialog()!.querySelector<HTMLTextAreaElement>("#note-content")!
    field.value = value
    field.dispatchEvent(new Event("input", { bubbles: true }))
    field.dispatchEvent(new Event("change", { bubbles: true }))
    field.dispatchEvent(new Event("blur"))
    await settle()
  }
  const submit = async () => {
    dialog()!
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
    await settle()
  }
  await settle()
  return {
    fixture,
    root,
    panel,
    dialog,
    settle,
    click,
    loaded,
    respond,
    fill,
    submit,
    reads,
    creates,
    read,
    create,
    success,
    error,
    profile
  }
}

describe("customer detail · CRM notes", () => {
  afterEach(() => {
    document.querySelectorAll("app-note-editor").forEach(node => node.remove())
    vi.restoreAllMocks()
  })

  it("renders the verified owner's notes and offers editing only for the session author", async () => {
    const s = await setup()
    await s.loaded()
    expect(s.panel()).not.toBeNull()
    expect(s.panel().getAttribute("data-crm-notes")).toBe("customer:7")
    expect(s.read).toHaveBeenCalledWith({ kind: "customer", id: 7 }, { offset: 0, limit: 20 })
    await s.respond(page([own, other]))
    const rows = [...s.panel().querySelectorAll<HTMLElement>("[data-note-id]")]
    expect(rows.map(row => row.getAttribute("data-note-id"))).toEqual(["4", "5"])
    expect(s.panel().textContent).toContain("Nota de la sesión")
    expect(s.panel().textContent).toContain("Nota ajena")
    const edit = [...s.panel().querySelectorAll<HTMLButtonElement>("button")].filter(
      button => button.textContent?.trim() === "Editar nota"
    )
    expect(edit.map(button => button.getAttribute("aria-label"))).toEqual(["Editar nota 4"])
  })

  it("shows an authoritative denial as a permission outcome instead of an empty list", async () => {
    const s = await setup()
    await s.loaded()
    await s.respond(Result.failure(new CommunicationsError("FORBIDDEN")))
    expect(s.panel().querySelector("[data-notes-denied]")).not.toBeNull()
    expect(s.panel().textContent).toContain("No tienes permiso")
    expect(s.panel().querySelector("[data-note-id]")).toBeNull()
    expect(s.panel().textContent).not.toContain("No hay notas registradas")
    await s.click("Reintentar notas", s.panel())
    expect(s.read).toHaveBeenCalledTimes(2)
  })

  it("creates a note once, blocks duplicate/dismissal while pending and rereads after success", async () => {
    const s = await setup()
    await s.loaded()
    await s.respond(page([own]))
    await s.click("Nueva nota", s.panel())
    expect(s.dialog()).not.toBeNull()
    await s.fill("  Nota nueva  ")
    await s.submit()
    expect(s.create).toHaveBeenCalledTimes(1)
    expect(s.create).toHaveBeenCalledWith({ kind: "customer", id: 7 }, { content: "Nota nueva" })
    expect(s.dialog()!.textContent).toContain("Guardando")
    await s.submit()
    expect(s.create).toHaveBeenCalledTimes(1)
    const cdk = getDebugNode(s.dialog()!)!.injector.get(CdkDialogRef)
    cdk.overlayRef.backdropElement!.click()
    await s.settle()
    expect(s.dialog()).not.toBeNull()

    s.creates
      .at(-1)!
      .next(Result.success(CrmNote.create(6, 7, null, "Nota nueva", 7, "Autora", date, null)))
    s.creates.at(-1)!.complete()
    await s.settle()
    expect(s.dialog()).toBeNull()
    expect(s.success).toHaveBeenCalledWith("Nota registrada correctamente.")
    expect(s.read).toHaveBeenCalledTimes(2)
  })

  it("issues exactly one bounded correction for an empty page past the reported total", async () => {
    const s = await setup()
    await s.loaded()
    await s.respond(page([own], 0, 20, 41))
    await s.click("Página 3", s.panel())
    expect(s.read).toHaveBeenLastCalledWith({ kind: "customer", id: 7 }, { offset: 40, limit: 20 })
    // The requested page is now past the reported total: one corrective read, not a loop.
    await s.respond(page([], 40, 20, 12))
    expect(s.read).toHaveBeenCalledTimes(2)
    expect(s.panel().querySelector("[data-note-id]")).not.toBeNull()
    expect(s.panel().textContent).toContain("Nota de la sesión")
  })

  it("keeps the refused draft in the open dialog without replaying the write", async () => {
    const s = await setup()
    await s.loaded()
    await s.respond(page([]))
    await s.click("Nueva nota", s.panel())
    await s.fill("Borrador")
    await s.submit()
    s.creates.at(-1)!.next(Result.failure(new CommunicationsError("FORBIDDEN")))
    s.creates.at(-1)!.complete()
    await s.settle()
    expect(s.dialog()).not.toBeNull()
    expect(s.dialog()!.textContent).toContain("No tienes permiso")
    expect(s.dialog()!.querySelector<HTMLTextAreaElement>("#note-content")!.value).toBe("Borrador")
    expect(s.create).toHaveBeenCalledTimes(1)
    await s.settle()
    await s.click("Cancelar", s.dialog()!)
    expect(s.dialog()).toBeNull()
  })
})
