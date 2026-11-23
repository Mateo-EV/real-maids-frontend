import { Injectable } from "@angular/core"
import { CrmNote } from "../../domain/entities/crm-note.entity"
import { CrmEmail } from "../../domain/entities/crm-email.entity"
import { EmailTemplate } from "../../domain/entities/email-template.entity"
import {
  CreateCrmNoteParams,
  CrmCommunicationQuery,
  CrmTarget,
  SendCrmEmailParams,
  UpdateCrmNoteParams
} from "../../domain/params/crm-communications.params"
import { communicationsTransport } from "./communications-http.transport"
import {
  date,
  id,
  input,
  invalid,
  list,
  nullableDate,
  nullableId,
  nullableText,
  page,
  pagination,
  readId,
  record,
  required,
  text
} from "./communications-http.validation"

const NOTE_CONTENT_MAX = 4000
/** `/api/crm/clientes/{id}` or `/api/crm/prospectos/{id}`: the two note tables keep real FKs. */
const ownerSegment = (target: CrmTarget) =>
  target.kind === "customer" ? "clientes" : target.kind === "lead" ? "prospectos" : undefined

/** Exactly one owner column is set, the other is null; anything else is a broken response. */
function ownerOf(p: Record<string, unknown>) {
  const customerId = nullableId(p["idCliente"]),
    leadId = nullableId(p["idProspecto"])
  if ((customerId === null) === (leadId === null)) invalid()
  return { customerId, leadId }
}
function owned(owner: { customerId: number | null; leadId: number | null }, target: CrmTarget) {
  const recorded = target.kind === "customer" ? owner.customerId : owner.leadId
  if (recorded !== target.id) invalid()
}
function noteDto(v: unknown, target: CrmTarget) {
  const p = record(v),
    owner = ownerOf(p)
  owned(owner, target)
  return CrmNote.create(
    readId(p["idNota"]),
    owner.customerId,
    owner.leadId,
    text(p["contenido"]),
    readId(p["idAutor"]),
    text(p["autor"]),
    date(p["fechaRegistro"]),
    nullableDate(p["fechaEdicion"])
  )
}
function emailDto(v: unknown, target: CrmTarget) {
  const p = record(v),
    owner = ownerOf(p),
    estado = p["estado"]
  owned(owner, target)
  if (estado !== "ENVIADO" && estado !== "FALLIDO") invalid()
  return CrmEmail.create(
    readId(p["idCorreo"]),
    owner.customerId,
    owner.leadId,
    nullableId(p["idPlantilla"]),
    text(p["destinatario"]),
    text(p["asunto"]),
    text(p["cuerpo"]),
    estado,
    nullableText(p["detalleError"]),
    readId(p["idAutor"]),
    text(p["autor"]),
    date(p["fechaEnvio"])
  )
}
function templateDto(v: unknown) {
  const p = record(v)
  return EmailTemplate.create(
    readId(p["idPlantilla"]),
    text(p["evento"]),
    text(p["idioma"]),
    nullableText(p["asunto"]),
    text(p["cuerpo"])
  )
}
/** Note content travels trimmed; blank or oversized input never reaches the API. */
function noteBody(params: CreateCrmNoteParams) {
  const content = required(params.content, NOTE_CONTENT_MAX)
  input(content !== null)
  return { contenido: content }
}
/**
 * Only the template reference and non-blank overrides travel: a blank subject or body falls back to
 * the chosen template, so it is omitted. Without a template both are required.
 */
function emailBody(params: SendCrmEmailParams) {
  const templateId = params.templateId,
    subject = required(params.subject, Number.MAX_SAFE_INTEGER),
    body = required(params.body, Number.MAX_SAFE_INTEGER)
  input(
    (templateId === null || id(templateId)) &&
      (params.subject === null || typeof params.subject === "string") &&
      (params.body === null || typeof params.body === "string") &&
      (templateId !== null || (subject !== null && body !== null))
  )
  return {
    ...(templateId === null ? {} : { idPlantilla: templateId }),
    ...(subject === null ? {} : { asunto: subject }),
    ...(body === null ? {} : { cuerpo: body })
  }
}

/** Validated transport for the confirmed CRM notes, email history and template contracts. */
@Injectable({ providedIn: "root" })
export class CommunicationsHttpSource {
  private readonly t = communicationsTransport()
  private readonly http = this.t.http
  private path(target: CrmTarget, resource: "notas" | "correos") {
    const segment = ownerSegment(target)
    input(segment !== undefined && id(target.id))
    return `${this.t.origin}/api/crm/${segment}/${target.id}/${resource}`
  }
  /** The page/size pair is validated at dispatch time, never while the Observable is built. */
  private paged(target: CrmTarget, resource: "notas" | "correos", query: CrmCommunicationQuery) {
    const params = pagination(query.offset, query.limit)
    return { url: this.path(target, resource), params }
  }
  private read<T extends { id: number }>(
    target: CrmTarget,
    resource: "notas" | "correos",
    query: CrmCommunicationQuery,
    parse: (v: unknown) => T
  ) {
    const pageQuery = () => pagination(query.offset, query.limit)
    return this.t.request(
      () => {
        const { url, params } = this.paged(target, resource, query)
        return this.http.get<unknown>(url, { params, transferCache: false })
      },
      v => {
        const { pagina, tamanio } = pageQuery()
        return page(v, parse, pagina, tamanio)
      }
    )
  }
  listNotes(target: CrmTarget, query: CrmCommunicationQuery = {}) {
    return this.read(target, "notas", query, item => noteDto(item, target))
  }
  createNote(target: CrmTarget, params: CreateCrmNoteParams) {
    return this.t.request(
      () =>
        this.http.post<unknown>(this.path(target, "notas"), noteBody(params), {
          transferCache: false
        }),
      v => noteDto(v, target)
    )
  }
  updateNote(target: CrmTarget, params: UpdateCrmNoteParams) {
    return this.t.request(
      () => {
        input(id(params.id))
        const url = `${this.path(target, "notas")}/${params.id}`
        return this.http.put<unknown>(url, noteBody(params), { transferCache: false })
      },
      v => {
        const note = noteDto(v, target)
        // An author-only edit must answer the record that was addressed.
        if (note.id !== params.id) invalid()
        return note
      }
    )
  }
  listEmails(target: CrmTarget, query: CrmCommunicationQuery = {}) {
    return this.read(target, "correos", query, item => emailDto(item, target))
  }
  sendEmail(target: CrmTarget, params: SendCrmEmailParams) {
    return this.t.request(
      () =>
        this.http.post<unknown>(this.path(target, "correos"), emailBody(params), {
          transferCache: false
        }),
      v => emailDto(v, target)
    )
  }
  listTemplates() {
    return this.t.request(
      () =>
        this.http.get<unknown>(`${this.t.origin}/api/crm/plantillas-correo`, {
          transferCache: false
        }),
      v => list(v, templateDto) as readonly EmailTemplate[]
    )
  }
}
