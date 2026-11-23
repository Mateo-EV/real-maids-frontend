import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Observable, of, Subject } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
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
} from "../../application/use-cases/crm-communications.use-cases"
import { CrmNote } from "../../domain/entities/crm-note.entity"
import { CrmEmail } from "../../domain/entities/crm-email.entity"
import { EmailTemplate } from "../../domain/entities/email-template.entity"
import { CommunicationsError } from "../../domain/errors/communications.error"
import { CrmTarget } from "../../domain/params/crm-communications.params"
import { CrmCommunicationsStore } from "./crm-communications.store"

const customer: CrmTarget = { kind: "customer", id: 7 }
const lead: CrmTarget = { kind: "lead", id: 9 }
const date = new Date("2026-03-02T12:00:00Z")
const note = (id = 4) => CrmNote.create(id, 7, null, "Contenido", 12, "Autora", date, null)
const email = (id = 8) =>
  CrmEmail.create(
    id,
    7,
    null,
    3,
    "cliente@example.test",
    "Asunto",
    "Cuerpo",
    "ENVIADO",
    null,
    12,
    "Autora",
    date
  )
const pageOf = <T>(items: T[], limit = 20): PaginationResponse<T> => ({
  items,
  total: items.length,
  offset: 0,
  limit
})

interface Harness {
  store: InstanceType<typeof CrmCommunicationsStore>
  notes: ReturnType<typeof vi.fn>
  emails: ReturnType<typeof vi.fn>
  templates: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  send: ReturnType<typeof vi.fn>
  session: BehaviorSubject<AuthSession | null>
  requests: Subject<Result<PaginationResponse<CrmNote>, CommunicationsError>>[]
}

function setup(server = false, emailRequests = false): Harness {
  const session = new BehaviorSubject<AuthSession | null>(
    AuthSession.create("Fixture", "fixture@example.test", null, 9999999, 12)
  )
  const requests: Subject<Result<PaginationResponse<CrmNote>, CommunicationsError>>[] = []
  const notes = vi.fn(() => {
    const subject = new Subject<Result<PaginationResponse<CrmNote>, CommunicationsError>>()
    requests.push(subject)
    return subject
  })
  const emails = vi.fn(() => of(Result.success(pageOf([email()]))))
  const templates = vi.fn(() =>
    of(Result.success([EmailTemplate.create(3, "evento", "es", null, "B")]))
  )
  const create = vi.fn(() => of(Result.success(note())))
  const update = vi.fn(() => of(Result.success(note())))
  const send = vi.fn(() => of(Result.success(email())))
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthStore, useValue: { session: () => session.value } },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session.asObservable() } },
      { provide: ListCrmNotesUseCase, useValue: { execute: notes } },
      { provide: ListCrmEmailsUseCase, useValue: { execute: emails } },
      { provide: ListEmailTemplatesUseCase, useValue: { execute: templates } },
      { provide: CreateCrmNoteUseCase, useValue: { execute: create } },
      { provide: UpdateCrmNoteUseCase, useValue: { execute: update } },
      { provide: SendCrmEmailUseCase, useValue: { execute: send } },
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  void emailRequests
  return {
    store: TestBed.inject(CrmCommunicationsStore),
    notes,
    emails,
    templates,
    create,
    update,
    send,
    session,
    requests
  }
}

describe("CrmCommunicationsStore", () => {
  beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(1000))
  afterEach(() => vi.restoreAllMocks())

  it("keys notes by owner and page, adopts the effective server metadata and honours the success-only TTL", () => {
    const { store, notes, requests } = setup()
    store.loadNotes(customer).subscribe()
    requests.at(-1)!.next(Result.success(pageOf([note()], 5)))
    store.loadNotes(customer, { offset: 20, limit: 20 }).subscribe()
    store.loadNotes(lead).subscribe()
    expect(notes.mock.calls).toEqual([
      [customer, { offset: 0, limit: 20 }],
      [customer, { offset: 20, limit: 20 }],
      [lead, { offset: 0, limit: 20 }]
    ])
    const verified = store.selectNotes(customer)
    expect(verified.loaded).toBe(true)
    expect(verified.data?.limit).toBe(5)

    // 30999ms is still fresh; a failed read never renews the window.
    vi.mocked(Date.now).mockReturnValue(30999)
    store.loadNotes(customer).subscribe()
    expect(notes).toHaveBeenCalledTimes(3)
    vi.mocked(Date.now).mockReturnValue(31000)
    store.loadNotes(customer).subscribe()
    expect(notes).toHaveBeenCalledTimes(4)
    expect(store.selectNotes(lead).loaded).toBe(false)
  })

  it("shares one in-flight read per key and keeps the verified page on a transient failure", () => {
    const { store, notes, requests } = setup()
    const first = new Subject<Result<PaginationResponse<CrmNote>, CommunicationsError>>()
    notes.mockReturnValueOnce(first as unknown as Observable<never>)
    store.loadNotes(customer).subscribe()
    store.loadNotes(customer).subscribe()
    expect(notes).toHaveBeenCalledTimes(1)
    first.next(Result.success(pageOf([note()])))
    first.complete()
    expect(store.selectNotes(customer).data?.items.map(item => item.id)).toEqual([4])

    notes.mockReturnValueOnce(of(Result.failure(new CommunicationsError("NETWORK"))))
    store.loadNotes(customer, {}, true).subscribe()
    const stale = store.selectNotes(customer)
    expect(stale.loaded).toBe(true)
    expect(stale.data?.items).toHaveLength(1)
    expect(stale.error?.code).toBe("NETWORK")
    expect(stale.expires).toBe(0)
  })

  it("treats an authoritative denial as a permission outcome and never as an empty page", () => {
    const { store, notes, requests } = setup()
    store.loadNotes(customer).subscribe()
    requests.at(-1)!.next(Result.success(pageOf([note()])))
    requests.at(-1)!.complete()
    expect(store.selectNotes(customer).loaded).toBe(true)
    vi.mocked(Date.now).mockReturnValue(2000)
    notes.mockReturnValueOnce(of(Result.failure(new CommunicationsError("FORBIDDEN"))))
    store.loadNotes(customer, {}, true).subscribe()
    const denied = store.selectNotes(customer)
    expect(denied.denied).toBe(true)
    expect(denied.loaded).toBe(false)
    expect(denied.data).toBeNull()
    expect(denied.error?.code).toBe("FORBIDDEN")

    // A later transient failure must not present the denial as staleness…
    notes.mockReturnValueOnce(of(Result.failure(new CommunicationsError("NETWORK"))))
    store.loadNotes(customer, {}, true).subscribe()
    expect(store.selectNotes(customer).denied).toBe(true)
    expect(store.selectNotes(customer).error?.code).toBe("FORBIDDEN")
    expect(store.selectNotes(customer).data).toBeNull()

    // …and only a successful authorized read clears it.
    notes.mockReturnValueOnce(of(Result.success(pageOf([note()]))))
    store.loadNotes(customer, {}, true).subscribe()
    expect(store.selectNotes(customer).denied).toBe(false)
    expect(store.selectNotes(customer).data?.items).toHaveLength(1)
  })

  it("invalidates only the written owner after a confirmed note write and refreshes observed keys once", () => {
    const { store, notes, create, update } = setup()
    notes.mockReturnValue(of(Result.success(pageOf([note()]))))
    store.observeNotes(customer).subscribe()
    store.loadNotes(lead).subscribe()
    expect(notes).toHaveBeenCalledTimes(2)
    vi.mocked(Date.now).mockReturnValue(40000)

    store.createNote(customer, { content: "Contenido" }).subscribe()
    expect(create).toHaveBeenCalledWith(customer, { content: "Contenido" })
    // The observed key of the written owner is reread exactly once…
    expect(notes).toHaveBeenCalledTimes(3)
    expect(store.selectNotes(customer).expires).toBeGreaterThan(31000)
    // …while another owner's verified page keeps its own freshness.
    expect(store.selectNotes(lead).expires).toBe(31000)

    store.updateNote(customer, { id: 4, content: "Editado" }).subscribe()
    expect(update).toHaveBeenCalledWith(customer, { id: 4, content: "Editado" })
    expect(notes).toHaveBeenCalledTimes(4)
  })

  it("keeps a failed write visible without invalidating anything or replaying the request", () => {
    const { store, notes, create } = setup()
    notes.mockReturnValue(of(Result.success(pageOf([note()]))))
    store.loadNotes(customer).subscribe()
    const before = store.selectNotes(customer).expires
    create.mockReturnValueOnce(of(Result.failure(new CommunicationsError("FORBIDDEN"))))
    let result: Result<CrmNote, CommunicationsError> | undefined
    store.createNote(customer, { content: "Contenido" }).subscribe(value => (result = value))
    expect(result?.success).toBe(false)
    expect(store.writeError()?.code).toBe("FORBIDDEN")
    expect(store.writing()).toBe(false)
    expect(store.selectNotes(customer).expires).toBe(before)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it("records the send once and rereads the email history of that owner only", () => {
    const { store, emails, send } = setup()
    store.observeEmails(customer).subscribe()
    store.loadEmails(lead).subscribe()
    expect(emails).toHaveBeenCalledTimes(2)
    vi.mocked(Date.now).mockReturnValue(40000)
    store.sendEmail(customer, { templateId: 3, subject: null, body: null }).subscribe()
    expect(send).toHaveBeenCalledWith(customer, { templateId: 3, subject: null, body: null })
    expect(emails).toHaveBeenCalledTimes(3)
    expect(store.selectEmails(lead).expires).toBe(31000)
  })

  it("clears verified communications and fences pending writes on session replacement", () => {
    const { store, notes, session, create } = setup()
    notes.mockReturnValue(of(Result.success(pageOf([note()]))))
    store.loadNotes(customer).subscribe()
    expect(store.selectNotes(customer).loaded).toBe(true)
    const pending = new Subject<Result<CrmNote, CommunicationsError>>()
    create.mockReturnValueOnce(pending as unknown as Observable<never>)
    let result: Result<CrmNote, CommunicationsError> | undefined
    store.createNote(customer, { content: "Contenido" }).subscribe(value => (result = value))
    expect(store.writing()).toBe(true)

    session.next(AuthSession.create("Other", "other@example.test", null, 99999999, 13))
    expect(store.selectNotes(customer).loaded).toBe(false)
    expect(notes).toHaveBeenCalledTimes(1)
    pending.next(Result.success(note()))
    expect(result).toBeUndefined()
    expect(store.writing()).toBe(false)
  })

  it("dispatches no read on the server platform", () => {
    const { store, notes } = setup(true)
    store.loadNotes(customer).subscribe()
    expect(notes).not.toHaveBeenCalled()
    expect(store.selectNotes(customer).loaded).toBe(false)
  })

  it("caches the editable templates in one entry with their own freshness", () => {
    const { store, templates } = setup()
    store.loadTemplates().subscribe()
    store.loadTemplates().subscribe()
    expect(templates).toHaveBeenCalledTimes(1)
    expect(store.selectTemplates().data?.map(t => t.id)).toEqual([3])
  })
})
