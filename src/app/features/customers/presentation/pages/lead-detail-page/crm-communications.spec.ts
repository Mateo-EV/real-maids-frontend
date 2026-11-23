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
import { CrmNote } from "@/app/features/communications/domain/entities/crm-note.entity"
import { CrmEmail } from "@/app/features/communications/domain/entities/crm-email.entity"
import { CommunicationsError } from "@/app/features/communications/domain/errors/communications.error"
import * as Actions from "../../../application/use-cases/acquisition.use-cases"
import { Lead } from "../../../domain/entities/lead.entity"
import { CustomerError } from "../../../domain/errors/customer.error"
import { LeadDetailPage } from "./lead-detail-page"

const date = new Date("2026-03-02T12:00:00Z")
const leadFixture = Lead.create(
  9,
  11,
  12,
  "Prospecto nueve",
  "lead@example.test",
  null,
  null,
  null,
  false,
  date,
  null
)
const note = CrmNote.create(4, null, 9, "Nota del prospecto", 12, "Autora", date, null)
type NotesRead = Result<PaginationResponse<CrmNote>, CommunicationsError>
type EmailsRead = Result<PaginationResponse<CrmEmail>, CommunicationsError>
const okNotes = (items: CrmNote[] = [note]): NotesRead =>
  Result.success({ items, total: items.length, offset: 0, limit: 20 })
const okEmails = (): EmailsRead => Result.success({ items: [], total: 0, offset: 0, limit: 20 })

async function setup(server = false) {
  const profile = new Subject<Result<Lead, CustomerError>>()
  const notes = vi.fn((): Observable<NotesRead> => of(okNotes()))
  const emails = vi.fn((): Observable<EmailsRead> => of(okEmails()))
  const unexpected = vi.fn(() => {
    throw new Error("Unexpected read/write")
  })
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Test", "test@example.test", null, Date.now() + 600000, 12)
  )
  TestBed.configureTestingModule({
    imports: [LeadDetailPage],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          paramMap: new BehaviorSubject(convertToParamMap({ id: "9" })),
          queryParamMap: of(convertToParamMap({})),
          snapshot: { queryParamMap: convertToParamMap({}) }
        }
      },
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
      { provide: HotToastService, useValue: { success: vi.fn(), error: vi.fn() } },
      { provide: Actions.GetLeadUseCase, useValue: { execute: () => profile } },
      ...[
        Actions.ListLeadsUseCase,
        Actions.ListLeadOriginsUseCase,
        Actions.ListFunnelStagesUseCase,
        Actions.ListLeadFollowUpsUseCase,
        Actions.AddLeadFollowUpUseCase,
        Actions.ConvertLeadUseCase,
        Actions.CreateLeadUseCase,
        Actions.UpdateLeadUseCase,
        Actions.DeleteLeadUseCase,
        Actions.GetLeadStatisticsUseCase
      ].map(provide => ({ provide, useValue: { execute: unexpected } })),
      { provide: ListCrmNotesUseCase, useValue: { execute: notes } },
      { provide: CreateCrmNoteUseCase, useValue: { execute: unexpected } },
      { provide: UpdateCrmNoteUseCase, useValue: { execute: unexpected } },
      { provide: ListCrmEmailsUseCase, useValue: { execute: emails } },
      {
        provide: ListEmailTemplatesUseCase,
        useValue: { execute: () => of(Result.success([])) }
      },
      { provide: SendCrmEmailUseCase, useValue: { execute: unexpected } },
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  const fixture = TestBed.createComponent(LeadDetailPage),
    root = fixture.nativeElement as HTMLElement
  const settle = async () => {
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
  }
  const loaded = async () => {
    profile.next(Result.success(leadFixture))
    profile.complete()
    await settle()
  }
  await settle()
  return { root, settle, loaded, notes, emails }
}

describe("lead detail · CRM communications", () => {
  afterEach(() => vi.restoreAllMocks())

  it("reads notes and email history with the lead owner, never a customer identity", async () => {
    const s = await setup()
    await s.loaded()
    const notes = s.root.querySelector<HTMLElement>("app-crm-notes")!
    const emails = s.root.querySelector<HTMLElement>("app-crm-emails")!
    expect(notes.getAttribute("data-crm-notes")).toBe("lead:9")
    expect(emails.getAttribute("data-crm-emails")).toBe("lead:9")
    expect(s.notes).toHaveBeenCalledWith({ kind: "lead", id: 9 }, { offset: 0, limit: 20 })
    expect(s.emails).toHaveBeenCalledWith({ kind: "lead", id: 9 }, { offset: 0, limit: 20 })
    expect(notes.textContent).toContain("Nota del prospecto")
  })

  it("shows a denied email history as a permission outcome instead of an empty history", async () => {
    const s = await setup()
    s.emails.mockReturnValueOnce(of(Result.failure(new CommunicationsError("FORBIDDEN"))))
    await s.loaded()
    const emails = s.root.querySelector<HTMLElement>("app-crm-emails")!
    expect(emails.querySelector("[data-emails-denied]")).not.toBeNull()
    expect(emails.textContent).toContain("No tienes permiso")
    expect(emails.textContent).not.toContain("No se ha registrado ningún correo")
  })
})
