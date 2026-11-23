import { ComponentFixture, TestBed } from "@angular/core/testing"
import { BehaviorSubject, Subject } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
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
} from "../../../application/use-cases/crm-communications.use-cases"
import { CrmEmail, CrmEmailStatus } from "../../../domain/entities/crm-email.entity"
import { CommunicationsError } from "../../../domain/errors/communications.error"
import { CrmEmails } from "./crm-emails"

const date = new Date("2026-03-02T12:00:00Z")
const recorded = (id: number, status: CrmEmailStatus, errorDetail: string | null = null) =>
  CrmEmail.create(
    id,
    7,
    null,
    null,
    "cliente@example.test",
    `Asunto ${id}`,
    `Cuerpo ${id}`,
    status,
    errorDetail,
    12,
    "Autora",
    date
  )
type EmailsRead = Result<PaginationResponse<CrmEmail>, CommunicationsError>

async function setup() {
  const reads: Subject<EmailsRead>[] = []
  const listEmails = vi.fn(() => {
    const request = new Subject<EmailsRead>()
    reads.push(request)
    return request
  })
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Fixture", "fixture@example.test", null, Date.now() + 600000, 12)
  )
  const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn() }
  const dialogs = {
    context: undefined as Record<string, unknown> | undefined,
    open: vi.fn((_component: unknown, options?: { context?: Record<string, unknown> }) => {
      dialogs.context = options?.context
      return { open: true, close: vi.fn() }
    })
  }
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
      { provide: ListCrmEmailsUseCase, useValue: { execute: listEmails } },
      {
        provide: ListCrmNotesUseCase,
        useValue: { execute: () => new Subject() }
      },
      {
        provide: ListEmailTemplatesUseCase,
        useValue: { execute: () => new Subject() }
      },
      { provide: CreateCrmNoteUseCase, useValue: { execute: vi.fn() } },
      { provide: UpdateCrmNoteUseCase, useValue: { execute: vi.fn() } },
      { provide: SendCrmEmailUseCase, useValue: { execute: vi.fn() } },
      { provide: HotToastService, useValue: toast },
      { provide: HlmDialogService, useValue: dialogs }
    ]
  })
  const fixture: ComponentFixture<CrmEmails> = TestBed.createComponent(CrmEmails)
  const ownerChanged$ = new Subject<void>()
  fixture.componentRef.setInput("kind", "customer")
  fixture.componentRef.setInput("targetId", 7)
  fixture.componentRef.setInput("ownerChanged$", ownerChanged$.asObservable())
  const host = () => fixture.nativeElement as HTMLElement
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const respond = async (items: CrmEmail[], index = reads.length - 1) => {
    reads[index].next(Result.success({ items, total: items.length, offset: 0, limit: 20 }))
    reads[index].complete()
    await settle()
  }
  const rows = () => [...host().querySelectorAll<HTMLElement>("[data-email-id]")]
  const click = async (label: string) => {
    const button = [...host().querySelectorAll<HTMLButtonElement>("button")].find(
      candidate => candidate.textContent?.trim() === label
    )
    expect(button, label).toBeDefined()
    button!.click()
    await settle()
  }
  await settle()
  return { fixture, host, settle, respond, rows, click, listEmails, toast, dialogs }
}

describe("CrmEmails · recorded delivery outcomes", () => {
  afterEach(() => vi.restoreAllMocks())

  it("presents an INTENTO row as an unknown outcome and never as sent", async () => {
    const s = await setup()
    await s.respond([recorded(10, "INTENTO")])
    const row = s.rows()[0]
    expect(row).toBeDefined()
    expect(row.querySelector("[data-email-status]")?.textContent?.trim()).toBe("Sin confirmar")
    expect(row.textContent).not.toContain("ENVIADO")
    expect(row.textContent).not.toContain("fallido")
    expect(row.querySelector("[data-email-unknown]")?.textContent).toContain(
      "No se pudo confirmar el resultado de este envío"
    )
    expect(row.querySelector("[data-email-unknown]")?.textContent).toContain("ya lo haya recibido")
    // The outcome is unknown: there is nothing to retry or resend from the history.
    expect(row.querySelectorAll("button")).toHaveLength(0)
    expect(s.host().textContent).not.toContain("Reenviar")
  })

  it("keeps ENVIADO and FALLIDO rendering as recorded, without an unknown-outcome note", async () => {
    const s = await setup()
    await s.respond([recorded(8, "ENVIADO"), recorded(9, "FALLIDO", "Transport rejected")])
    const rows = s.rows()
    expect(rows.map(row => row.querySelector("[data-email-status]")?.textContent?.trim())).toEqual([
      "ENVIADO",
      "FALLIDO"
    ])
    expect(rows[1].textContent).toContain("Transport rejected")
    expect(s.host().querySelector("[data-email-unknown]")).toBeNull()
    expect(rows.some(row => row.querySelectorAll("button").length > 0)).toBe(false)
  })

  it("reports an INTENTO answer as an unconfirmed delivery, not as sent or failed", async () => {
    const s = await setup()
    await s.respond([])
    await s.click("Redactar correo")
    expect(s.dialogs.context).toBeDefined()
    ;(s.dialogs.context!["onSent"] as (email: CrmEmail) => void)(recorded(11, "INTENTO"))
    await s.settle()
    expect(s.toast.success).not.toHaveBeenCalled()
    expect(s.toast.error).not.toHaveBeenCalled()
    expect(s.toast.warning).toHaveBeenCalledTimes(1)
    expect(String(s.toast.warning.mock.calls[0][0])).toContain("no se pudo confirmar la entrega")
  })
})
