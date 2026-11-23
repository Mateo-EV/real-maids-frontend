import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { ActivatedRoute, convertToParamMap, provideRouter } from "@angular/router"
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
import { CrmEmail } from "@/app/features/communications/domain/entities/crm-email.entity"
import { EmailTemplate } from "@/app/features/communications/domain/entities/email-template.entity"
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
const sent = CrmEmail.create(
  8,
  7,
  null,
  3,
  "cliente@example.test",
  "Asunto enviado",
  "Cuerpo enviado",
  "ENVIADO",
  null,
  12,
  "Autora",
  date
)
const failed = CrmEmail.create(
  9,
  7,
  null,
  null,
  "cliente@example.test",
  "Asunto fallido",
  "Cuerpo fallido",
  "FALLIDO",
  "Transport rejected",
  12,
  "Autora",
  date
)
const template = EmailTemplate.create(3, "bienvenida", "es", "Hola", "Cuerpo de la plantilla")
type EmailsRead = Result<PaginationResponse<CrmEmail>, CommunicationsError>
type TemplatesRead = Result<readonly EmailTemplate[], CommunicationsError>
const emailPage = (items: CrmEmail[]): EmailsRead =>
  Result.success({ items, total: items.length, offset: 0, limit: 20 })

async function setup(server = false) {
  const emailReads: Subject<EmailsRead>[] = [],
    sends: Subject<Result<CrmEmail, CommunicationsError>>[] = []
  const readEmails = vi.fn(() => {
    const request = new Subject<EmailsRead>()
    emailReads.push(request)
    return request
  })
  const readTemplates = vi.fn((): Observable<TemplatesRead> => of(Result.success([template])))
  const send = vi.fn(() => {
    const request = new Subject<Result<CrmEmail, CommunicationsError>>()
    sends.push(request)
    return request
  })
  const success = vi.fn(),
    error = vi.fn()
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "test@example.test", null, Date.now() + 600000, 12)
  )
  const profile = new Subject<Result<Customer, CustomerError>>()
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
      {
        provide: GetCustomerByIdUseCase,
        useValue: {
          execute: (id: number) =>
            id === 7 ? profile : of(Result.success(customerFixture(id, `C${id}`)))
        }
      },
      {
        provide: ListCustomerPropertiesUseCase,
        useValue: { execute: () => of(Result.success([])) }
      },
      ...[CreatePropertyUseCase, UpdatePropertyUseCase, SetPropertyStatusUseCase].map(provide => ({
        provide,
        useValue: { execute: vi.fn() }
      })),
      { provide: ListCustomerContactsUseCase, useValue: { execute: () => of(Result.success([])) } },
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
      {
        provide: ListCrmNotesUseCase,
        useValue: {
          execute: () => of(Result.success({ items: [], total: 0, offset: 0, limit: 20 }))
        }
      },
      { provide: CreateCrmNoteUseCase, useValue: { execute: vi.fn() } },
      { provide: UpdateCrmNoteUseCase, useValue: { execute: vi.fn() } },
      { provide: ListCrmEmailsUseCase, useValue: { execute: readEmails } },
      { provide: ListEmailTemplatesUseCase, useValue: { execute: readTemplates } },
      { provide: SendCrmEmailUseCase, useValue: { execute: send } },
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
  const panel = () => root.querySelector<HTMLElement>("app-crm-emails")!
  const dialog = () => document.querySelector<HTMLElement>("app-email-composer")
  const click = async (label: string, within: ParentNode = root) => {
    const button = [...within.querySelectorAll<HTMLButtonElement>("button")].find(
      b => b.textContent?.trim() === label || b.getAttribute("aria-label") === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  const loaded = async () => {
    profile.next(Result.success(customerFixture(7, "Cliente siete", "cliente@example.test")))
    await settle()
  }
  const respond = async (value: EmailsRead, index = emailReads.length - 1) => {
    emailReads[index].next(value)
    emailReads[index].complete()
    await settle()
  }
  const fill = async (field: string, value: string) => {
    const input = dialog()!.querySelector<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >(`#${field}`)!
    input.value = value
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
    input.dispatchEvent(new Event("blur"))
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
    root,
    panel,
    dialog,
    settle,
    click,
    loaded,
    respond,
    fill,
    submit,
    emailReads,
    sends,
    readEmails,
    readTemplates,
    send,
    success,
    error
  }
}

describe("customer detail · CRM email", () => {
  afterEach(() => {
    document.querySelectorAll("app-email-composer").forEach(node => node.remove())
    vi.restoreAllMocks()
  })

  it("renders the recorded deliveries with their real status and sanitized detail", async () => {
    const s = await setup()
    await s.loaded()
    expect(s.panel().getAttribute("data-crm-emails")).toBe("customer:7")
    expect(s.readEmails).toHaveBeenCalledWith({ kind: "customer", id: 7 }, { offset: 0, limit: 20 })
    await s.respond(emailPage([sent, failed]))
    const rows = [...s.panel().querySelectorAll<HTMLElement>("[data-email-id]")]
    expect(rows.map(row => row.getAttribute("data-email-id"))).toEqual(["8", "9"])
    expect(s.panel().textContent).toContain("Asunto enviado")
    expect(s.panel().textContent).toContain("ENVIADO")
    expect(s.panel().textContent).toContain("FALLIDO")
    expect(s.panel().textContent).toContain("Transport rejected")
    expect(s.panel().textContent).not.toContain("Reenviar")
  })

  it("navigates the recorded history with the size the server returned", async () => {
    const s = await setup()
    await s.loaded()
    await s.respond(Result.success({ items: [sent], total: 41, offset: 0, limit: 20 }))
    await s.click("Página siguiente", s.panel())
    expect(s.readEmails).toHaveBeenLastCalledWith(
      { kind: "customer", id: 7 },
      { offset: 20, limit: 20 }
    )
  })

  it("prefills the editable template and sends it once, rereading the history after success", async () => {
    const s = await setup()
    await s.loaded()
    await s.respond(emailPage([]))
    await s.click("Redactar correo", s.panel())
    expect(s.dialog()).not.toBeNull()
    expect(s.dialog()!.textContent).toContain("cliente@example.test")
    await s.fill("email-template", "3")
    expect(s.dialog()!.querySelector<HTMLInputElement>("#email-subject")!.value).toBe("Hola")
    expect(s.dialog()!.querySelector<HTMLTextAreaElement>("#email-body")!.value).toBe(
      "Cuerpo de la plantilla"
    )
    await s.fill("email-subject", "Asunto ajustado")
    await s.submit()
    expect(s.send).toHaveBeenCalledTimes(1)
    expect(s.send).toHaveBeenCalledWith(
      { kind: "customer", id: 7 },
      { templateId: 3, subject: "Asunto ajustado", body: "Cuerpo de la plantilla" }
    )
    s.sends.at(-1)!.next(Result.success(sent))
    s.sends.at(-1)!.complete()
    await s.settle()
    expect(s.dialog()).toBeNull()
    expect(s.success).toHaveBeenCalled()
    expect(s.readEmails).toHaveBeenCalledTimes(2)
  })

  it("blocks a free-text send without subject or body and never dispatches it", async () => {
    const s = await setup()
    await s.loaded()
    await s.respond(emailPage([]))
    await s.click("Redactar correo", s.panel())
    await s.submit()
    expect(s.send).not.toHaveBeenCalled()
    expect(s.dialog()!.querySelector("hlm-field-error, [role='alert']")).not.toBeNull()
  })

  it("keeps the draft after a failed send and never retries by itself", async () => {
    const s = await setup()
    await s.loaded()
    await s.respond(emailPage([]))
    await s.click("Redactar correo", s.panel())
    await s.fill("email-subject", "Asunto propio")
    await s.fill("email-body", "Cuerpo propio")
    await s.submit()
    expect(s.send).toHaveBeenCalledWith(
      { kind: "customer", id: 7 },
      { templateId: null, subject: "Asunto propio", body: "Cuerpo propio" }
    )
    s.sends.at(-1)!.next(Result.failure(new CommunicationsError("UNEXPECTED")))
    s.sends.at(-1)!.complete()
    await s.settle()
    expect(s.dialog()).not.toBeNull()
    expect(s.dialog()!.textContent).toContain("No se pudo confirmar")
    expect(s.dialog()!.querySelector<HTMLTextAreaElement>("#email-body")!.value).toBe(
      "Cuerpo propio"
    )
    expect(s.send).toHaveBeenCalledTimes(1)
    expect(s.success).not.toHaveBeenCalled()
  })
})
