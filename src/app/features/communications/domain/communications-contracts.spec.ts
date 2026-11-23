import { Injector } from "@angular/core"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { CommunicationsError, CommunicationsErrorCode } from "./errors/communications.error"
import {
  COMMUNICATIONS_REPOSITORY,
  CommunicationsRepository
} from "./repositories/communications.repository"
import { CrmNote } from "./entities/crm-note.entity"
import { CrmEmail } from "./entities/crm-email.entity"
import { EmailTemplate } from "./entities/email-template.entity"
import {
  CreateCrmNoteParams,
  CrmTarget,
  SendCrmEmailParams,
  UpdateCrmNoteParams
} from "./params/crm-communications.params"

const codes: CommunicationsErrorCode[] = [
  "NOT_FOUND",
  "INVALID_INPUT",
  "INVALID_RESPONSE",
  "FORBIDDEN",
  "UNAUTHENTICATED",
  "CONFLICT",
  "NETWORK",
  "UNCONFIGURED",
  "UNEXPECTED"
]

const date = new Date("2026-03-02T12:00:00Z")
const note = CrmNote.create(4, 7, null, "Contenido", 12, "Autora", date, null)

describe("communications contracts", () => {
  it.each(codes)("exposes a safe typed %s error", code => {
    const error = new CommunicationsError(code)
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe(code)
    expect(error.name).toBe("CommunicationsError")
    expect(error.message).not.toContain("http")
  })

  it("injects the CRM contract through the domain token with paged notes and emails", async () => {
    const customer: CrmTarget = { kind: "customer", id: 7 }
    const lead: CrmTarget = { kind: "lead", id: 9 }
    const repository: CommunicationsRepository = {
      listNotes: vi.fn(() => of(Result.success({ items: [note], total: 1, offset: 0, limit: 20 }))),
      createNote: vi.fn(() => of(Result.success(note))),
      updateNote: vi.fn(() => of(Result.success(note))),
      listEmails: vi.fn(() => of(Result.success({ items: [], total: 0, offset: 0, limit: 20 }))),
      sendEmail: vi.fn(() => of(Result.failure(new CommunicationsError("CONFLICT")))),
      listTemplates: vi.fn(() =>
        of(Result.success([EmailTemplate.create(3, "e", "es", null, "B")]))
      )
    }
    const injector = Injector.create({
      providers: [{ provide: COMMUNICATIONS_REPOSITORY, useValue: repository }]
    })
    const injected = injector.get(COMMUNICATIONS_REPOSITORY)
    expect(injected).toBe(repository)

    expect(await firstValueFrom(injected.listNotes(customer, { offset: 0, limit: 20 }))).toEqual(
      Result.success({ items: [note], total: 1, offset: 0, limit: 20 })
    )
    expect(repository.listNotes).toHaveBeenCalledWith(customer, { offset: 0, limit: 20 })

    const create: CreateCrmNoteParams = { content: "Contenido" }
    expect(await firstValueFrom(injected.createNote(customer, create))).toEqual(
      Result.success(note)
    )
    expect(repository.createNote).toHaveBeenCalledWith(customer, create)

    const update: UpdateCrmNoteParams = { id: 4, content: "Contenido editado" }
    expect(await firstValueFrom(injected.updateNote(customer, update))).toEqual(
      Result.success(note)
    )
    expect(repository.updateNote).toHaveBeenCalledWith(customer, update)

    expect(await firstValueFrom(injected.listEmails(lead, {}))).toEqual(
      Result.success({ items: [], total: 0, offset: 0, limit: 20 })
    )
    expect(repository.listEmails).toHaveBeenCalledWith(lead, {})

    const send: SendCrmEmailParams = { templateId: null, subject: "Asunto", body: "Cuerpo" }
    expect(await firstValueFrom(injected.sendEmail(lead, send))).toEqual(
      Result.failure(new CommunicationsError("CONFLICT"))
    )
    expect(repository.sendEmail).toHaveBeenCalledWith(lead, send)

    const templates = await firstValueFrom(injected.listTemplates())
    expect(templates.success && templates.data.map(t => t.id)).toEqual([3])
    injector.destroy()
  })

  it("separates a note update from its generated metadata", () => {
    const update: UpdateCrmNoteParams = { id: 4, content: "Editado" }
    expect(Object.keys(update).sort()).toEqual(["content", "id"])
    // @ts-expect-error Authorship always comes from the authenticated session, never the body.
    const body: CreateCrmNoteParams = { content: "x", authorId: 1 }
    expect(body).toHaveProperty("authorId")
    const send: SendCrmEmailParams = {
      templateId: null,
      subject: "s",
      body: "b",
      // @ts-expect-error The client never supplies the recipient address.
      recipient: "a@b.c"
    }
    expect(send).toHaveProperty("recipient")
  })

  it("keeps emails typed with their recorded status", () => {
    expect(
      CrmEmail.create(
        1,
        7,
        null,
        null,
        "cliente@example.test",
        "Asunto",
        "Cuerpo",
        "FALLIDO",
        "Detalle",
        12,
        "Autora",
        date
      ).status
    ).toBe("FALLIDO")
  })
})
