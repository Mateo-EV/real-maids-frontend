import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { CommunicationsRepositoryImpl } from "./communications.repository-impl"
import { CrmTarget } from "../../domain/params/crm-communications.params"

const base = "http://localhost:8080/api/crm"
const customer: CrmTarget = { kind: "customer", id: 7 }
const lead: CrmTarget = { kind: "lead", id: 9 }

const noteDto = {
  idNota: 4,
  idCliente: 7,
  idProspecto: null,
  contenido: "Contenido literal",
  idAutor: 12,
  autor: "Autora",
  fechaRegistro: "2026-03-02T12:00:00Z",
  fechaEdicion: null
}
const emailDto = {
  idCorreo: 8,
  idCliente: 7,
  idProspecto: null,
  idPlantilla: 3,
  destinatario: "cliente@example.test",
  asunto: "Asunto enviado",
  cuerpo: "Cuerpo enviado",
  estado: "ENVIADO",
  detalleError: null,
  idAutor: 12,
  autor: "Autora",
  fechaEnvio: "2026-03-02T12:00:00Z"
}
const wirePage = (
  contenido: unknown[],
  pagina = 0,
  tamanio = 20,
  totalElementos = contenido.length
) => ({
  contenido,
  pagina,
  tamanio,
  totalElementos,
  totalPaginas: Math.ceil(totalElementos / tamanio)
})

function setup(server = false) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: "http://localhost:8080" },
      ...(server ? [{ provide: PLATFORM_ID, useValue: "server" }] : [])
    ]
  })
  return TestBed.inject(CommunicationsRepositoryImpl)
}

describe("CRM communications HTTP boundary", () => {
  let repository: CommunicationsRepositoryImpl
  let http: HttpTestingController
  beforeEach(() => {
    repository = setup()
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())

  it("reads the customer note page and preserves the recorded owner, author and instants", async () => {
    const pending = firstValueFrom(repository.listNotes(customer, {}))
    const request = http.expectOne(`${base}/clientes/7/notas?pagina=0&tamanio=20`)
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    request.flush(wirePage([noteDto]))
    const result = await pending
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data).toEqual({
      items: [
        {
          id: 4,
          customerId: 7,
          leadId: null,
          content: "Contenido literal",
          authorId: 12,
          author: "Autora",
          registeredAt: new Date("2026-03-02T12:00:00Z"),
          editedAt: null
        }
      ],
      total: 1,
      offset: 0,
      limit: 20
    })
  })

  it("reads the lead note page from the prospectos path and adopts the effective server paging", async () => {
    const pending = firstValueFrom(repository.listNotes(lead, { offset: 40, limit: 20 }))
    const request = http.expectOne(`${base}/prospectos/9/notas?pagina=2&tamanio=20`)
    request.flush(wirePage([{ ...noteDto, idCliente: null, idProspecto: 9 }], 2, 5, 11))
    const result = await pending
    expect(result.success && result.data.items[0].leadId).toBe(9)
    expect(result.success && result.data.limit).toBe(5)
    expect(result.success && result.data.offset).toBe(10)
  })

  it.each([
    ["no owner", { idCliente: null, idProspecto: null }],
    ["both owners", { idCliente: 7, idProspecto: 9 }],
    ["another owner", { idCliente: 8, idProspecto: null }]
  ])("rejects a customer note response with %s", async (_case, owner) => {
    const pending = firstValueFrom(repository.listNotes(customer, {}))
    http
      .expectOne(`${base}/clientes/7/notas?pagina=0&tamanio=20`)
      .flush(wirePage([{ ...noteDto, ...owner }]))
    const result = await pending
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe("INVALID_RESPONSE")
  })

  it("rejects a malformed page envelope and an impossible effective size", async () => {
    const pending = firstValueFrom(repository.listNotes(customer, {}))
    http.expectOne(`${base}/clientes/7/notas?pagina=0&tamanio=20`).flush({
      contenido: [noteDto],
      pagina: 0,
      tamanio: 20,
      totalElementos: 1,
      totalPaginas: 7
    })
    const first = await pending
    expect(first.success).toBe(false)

    const second = firstValueFrom(repository.listNotes(customer, {}))
    http
      .expectOne(`${base}/clientes/7/notas?pagina=0&tamanio=20`)
      .flush(wirePage([noteDto], 0, 150, 1))
    const secondResult = await second
    expect(secondResult.success).toBe(false)
  })

  it("sends only the trimmed note content on create and validates it before dispatch", async () => {
    const pending = firstValueFrom(repository.createNote(customer, { content: "Contenido" }))
    const request = http.expectOne(`${base}/clientes/7/notas`)
    expect(request.request.method).toBe("POST")
    expect(request.request.body).toEqual({ contenido: "Contenido" })
    request.flush(noteDto, { status: 201, statusText: "Created" })
    const result = await pending
    expect(result.success && result.data.id).toBe(4)

    expect(
      (await firstValueFrom(repository.createNote(customer, { content: "   " }))).success
    ).toBe(false)
    expect(
      (await firstValueFrom(repository.createNote(customer, { content: "x".repeat(4001) }))).success
    ).toBe(false)
    expect(
      (await firstValueFrom(repository.createNote({ kind: "customer", id: 0 }, { content: "x" })))
        .success
    ).toBe(false)
  })

  it("edits a note through its own path and refuses a response naming another record", async () => {
    const pending = firstValueFrom(repository.updateNote(customer, { id: 4, content: "Editado" }))
    const request = http.expectOne(`${base}/clientes/7/notas/4`)
    expect(request.request.method).toBe("PUT")
    expect(request.request.body).toEqual({ contenido: "Editado" })
    request.flush({ ...noteDto, contenido: "Editado", fechaEdicion: "2026-03-03T12:00:00Z" })
    const result = await pending
    expect(result.success && result.data.content).toBe("Editado")
    expect(result.success && result.data.editedAt).toEqual(new Date("2026-03-03T12:00:00Z"))

    const mismatched = firstValueFrom(
      repository.updateNote(customer, { id: 4, content: "Editado" })
    )
    http
      .expectOne(`${base}/clientes/7/notas/4`)
      .flush({ ...noteDto, idNota: 5, contenido: "Editado" })
    const refused = await mismatched
    expect(refused.success).toBe(false)
    if (!refused.success) expect(refused.error.code).toBe("INVALID_RESPONSE")
  })

  it("maps an authoritative note denial to FORBIDDEN instead of an empty page", async () => {
    const pending = firstValueFrom(repository.listNotes(lead, {}))
    http.expectOne(`${base}/prospectos/9/notas?pagina=0&tamanio=20`).flush("Forbidden", {
      status: 403,
      statusText: "Forbidden"
    })
    const result = await pending
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe("FORBIDDEN")
  })

  it("reads the delivered email page with the recorded status and sanitized detail", async () => {
    const pending = firstValueFrom(repository.listEmails(customer, {}))
    const request = http.expectOne(`${base}/clientes/7/correos?pagina=0&tamanio=20`)
    expect(request.request.transferCache).toBe(false)
    request.flush(
      wirePage([
        emailDto,
        {
          ...emailDto,
          idCorreo: 9,
          idPlantilla: null,
          estado: "FALLIDO",
          detalleError: "Transport rejected"
        }
      ])
    )
    const result = await pending
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.items.map(item => [item.id, item.status, item.errorDetail])).toEqual([
      [8, "ENVIADO", null],
      [9, "FALLIDO", "Transport rejected"]
    ])
    expect(result.data.items[0].recipient).toBe("cliente@example.test")
  })

  it("accepts an INTENTO attempt whose delivery outcome is still unknown", async () => {
    const pending = firstValueFrom(repository.listEmails(customer, {}))
    http
      .expectOne(`${base}/clientes/7/correos?pagina=0&tamanio=20`)
      .flush(wirePage([{ ...emailDto, idCorreo: 10, idPlantilla: null, estado: "INTENTO" }]))
    const result = await pending
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.items.map(item => [item.id, item.status])).toEqual([[10, "INTENTO"]])
  })

  it("rejects an unknown delivery status instead of rendering it as sent", async () => {
    const pending = firstValueFrom(repository.listEmails(lead, {}))
    http
      .expectOne(`${base}/prospectos/9/correos?pagina=0&tamanio=20`)
      .flush(wirePage([{ ...emailDto, idCliente: null, idProspecto: 9, estado: "PENDIENTE" }]))
    const result = await pending
    expect(result.success).toBe(false)
  })

  it("sends only the supplied template and overrides, requiring both fields without a template", async () => {
    const templated = firstValueFrom(
      repository.sendEmail(customer, { templateId: 3, subject: null, body: null })
    )
    const request = http.expectOne(`${base}/clientes/7/correos`)
    expect(request.request.method).toBe("POST")
    expect(request.request.body).toEqual({ idPlantilla: 3 })
    request.flush(emailDto, { status: 201, statusText: "Created" })
    const result = await templated
    expect(result.success && result.data.status).toBe("ENVIADO")

    const overridden = firstValueFrom(
      repository.sendEmail(lead, { templateId: 3, subject: "Asunto", body: "Cuerpo" })
    )
    const second = http.expectOne(`${base}/prospectos/9/correos`)
    expect(second.request.body).toEqual({ idPlantilla: 3, asunto: "Asunto", cuerpo: "Cuerpo" })
    second.flush({ ...emailDto, idCliente: null, idProspecto: 9 })

    expect(
      (
        await firstValueFrom(
          repository.sendEmail(customer, { templateId: null, subject: null, body: null })
        )
      ).success
    ).toBe(false)
    expect(
      (
        await firstValueFrom(
          repository.sendEmail(customer, { templateId: null, subject: "Asunto", body: null })
        )
      ).success
    ).toBe(false)
    expect(
      (
        await firstValueFrom(
          repository.sendEmail(customer, { templateId: null, subject: "Asunto", body: "   " })
        )
      ).success
    ).toBe(false)
  })

  it("reports a failed send as a conflict once, without replaying the request", async () => {
    const pending = firstValueFrom(
      repository.sendEmail(customer, { templateId: null, subject: "Asunto", body: "Cuerpo" })
    )
    http.expectOne(`${base}/clientes/7/correos`).flush("Conflict", {
      status: 409,
      statusText: "Conflict"
    })
    const result = await pending
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe("CONFLICT")
    http.verify()
  })

  it("reads the editable templates with their nullable subject", async () => {
    const pending = firstValueFrom(repository.listTemplates())
    const request = http.expectOne(`${base}/plantillas-correo`)
    expect(request.request.method).toBe("GET")
    expect(request.request.transferCache).toBe(false)
    request.flush([
      { idPlantilla: 3, evento: "bienvenida", idioma: "es", asunto: "Hola", cuerpo: "Cuerpo" },
      { idPlantilla: 4, evento: "seguimiento", idioma: "es", asunto: null, cuerpo: "Otro" }
    ])
    const result = await pending
    expect(result.success && result.data.map(t => [t.id, t.event, t.subject])).toEqual([
      [3, "bienvenida", "Hola"],
      [4, "seguimiento", null]
    ])
  })

  it("rejects duplicated template identities and an unknown envelope", async () => {
    const pending = firstValueFrom(repository.listTemplates())
    http.expectOne(`${base}/plantillas-correo`).flush([
      { idPlantilla: 3, evento: "a", idioma: "es", asunto: null, cuerpo: "Uno" },
      { idPlantilla: 3, evento: "b", idioma: "es", asunto: null, cuerpo: "Dos" }
    ])
    expect((await pending).success).toBe(false)

    const notArray = firstValueFrom(repository.listTemplates())
    http.expectOne(`${base}/plantillas-correo`).flush({ contenido: [] })
    expect((await notArray).success).toBe(false)
  })

  it("dispatches nothing on the server platform and fails closed without an origin", async () => {
    TestBed.resetTestingModule()
    const server = setup(true)
    const result = await firstValueFrom(server.listNotes(customer, {}))
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe("UNCONFIGURED")
    expect(TestBed.inject(HttpTestingController).match(() => true).length).toBe(0)
  })
})
