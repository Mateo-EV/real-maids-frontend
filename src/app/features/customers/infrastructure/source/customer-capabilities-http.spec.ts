import { TestBed } from "@angular/core/testing"
import { PLATFORM_ID } from "@angular/core"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom, Observable } from "rxjs"
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { CustomerHttpSource } from "./customer-http.source"
import { AcquisitionHttpSource } from "./acquisition-http.source"
import { CustomerRelationsHttpSource } from "./customer-relations-http.source"
import { PropertyHttpSource } from "./property-http.source"
import { CustomerType } from "../../domain/entities/customer.entity"
import { Result } from "@/app/shared/utils/result"
import { CustomerError } from "../../domain/errors/customer.error"

const customer = {
  idCliente: 7,
  nombre: "Customer",
  tipo: "comercial",
  correo: "fake@example.test",
  telefono: "1234567",
  activo: true,
  idUsuario: null,
  fechaCreacion: "2026-01-01T00:00:00Z",
  fechaActualizacion: null,
  idProspecto: 3,
  identificacionFiscal: null,
  sistemaOrigen: null,
  idExterno: null,
  usuarioRegistro: 9
}
const origin = { idOrigen: 1, nombre: "Referral", descripcion: "Detail", activo: false }
const stage = { idEtapa: 2, nombre: "Contact", orden: -1, esFinal: false }
const lead = {
  idProspecto: 3,
  idOrigen: 1,
  idEtapa: 2,
  nombre: "Lead",
  correo: null,
  telefono: "1234567",
  direccionReferencia: "Reference",
  observacion: "Note",
  convertido: false,
  fechaRegistro: "2026-01-01T00:00:00Z",
  usuarioRegistro: 9
}
const leadInput = {
  originId: 1,
  stageId: 2,
  name: "Lead",
  email: null,
  phone: "1234567",
  referenceAddress: "Reference",
  observation: "Note"
}
const leadBody = {
  idOrigen: 1,
  idEtapa: 2,
  nombre: "Lead",
  correo: null,
  telefono: "1234567",
  direccionReferencia: "Reference",
  observacion: "Note"
}
const contact = {
  idContacto: 4,
  idCliente: 7,
  nombre: "Contact",
  cargo: "Manager",
  correo: null,
  telefono: "1234567",
  principal: true,
  activo: false
}
const contactInput = {
  name: "Contact",
  position: "Manager",
  email: null,
  phone: "1234567",
  isPrimary: true,
  isActive: false
}
const preference = {
  idPreferencia: 5,
  idCliente: 7,
  idPropiedad: null,
  tipo: "Cleaning",
  detalle: "Detail",
  activo: true
}
const preferenceInput = { propertyId: null, type: "Cleaning", detail: "Detail", isActive: true }
const property = {
  idPropiedad: 6,
  idCliente: 7,
  alias: "Home",
  direccion: "Street",
  ciudad: "City",
  estadoRegion: "Region",
  codigoPostal: "12345",
  areaM2: 123456.7,
  numeroAmbientes: 0,
  numeroBanos: 2,
  instruccionesAcceso: "Fixture instructions",
  codigoPuerta: "fixture-only",
  tieneMascotas: true,
  activo: false,
  fechaCreacion: "2026-01-01T00:00:00Z"
}
const propertyInput = {
  alias: "Home",
  address: "Street",
  city: "City",
  region: "Region",
  postalCode: "12345",
  areaM2: "123456.70",
  roomCount: 0,
  bathroomCount: 2,
  accessInstructions: "Fixture instructions",
  doorCode: "fixture-only",
  hasPets: true
}
const propertyBody = {
  alias: "Home",
  direccion: "Street",
  ciudad: "City",
  estadoRegion: "Region",
  codigoPostal: "12345",
  areaM2: 123456.7,
  numeroAmbientes: 0,
  numeroBanos: 2,
  instruccionesAcceso: "Fixture instructions",
  codigoPuerta: "fixture-only",
  tieneMascotas: true
}
const wirePage = (contenido: unknown[], total = contenido.length, size = 20, page = 0) => ({
  contenido,
  pagina: page,
  tamanio: size,
  totalElementos: total,
  totalPaginas: Math.ceil(total / size)
})

function setup(origin: unknown = "http://localhost:8080", platform = "browser") {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: API_URL, useValue: origin },
      { provide: PLATFORM_ID, useValue: platform }
    ]
  })
}
describe("Customer supported HTTP operations", () => {
  let http: HttpTestingController
  let customers: CustomerHttpSource,
    acquisition: AcquisitionHttpSource,
    relations: CustomerRelationsHttpSource,
    properties: PropertyHttpSource
  beforeEach(() => {
    setup()
    http = TestBed.inject(HttpTestingController)
    customers = TestBed.inject(CustomerHttpSource)
    acquisition = TestBed.inject(AcquisitionHttpSource)
    relations = TestBed.inject(CustomerRelationsHttpSource)
    properties = TestBed.inject(PropertyHttpSource)
  })
  afterEach(() => http.verify())
  async function check<T>(
    stream: Observable<Result<T, CustomerError>>,
    method: string,
    path: string,
    body: unknown,
    response: object,
    expected: unknown
  ) {
    const pending = firstValueFrom(stream)
    const request = http.expectOne(`http://localhost:8080/api/${path}`)
    expect(request.request.method).toBe(method)
    expect(request.request.transferCache).toBe(false)
    expect(request.request.body).toEqual(body)
    request.flush(response)
    expect(await pending).toEqual({ success: true, data: expected })
  }
  const mappedCustomer = {
    id: 7,
    name: "Customer",
    userId: null,
    type: CustomerType.COMMERCIAL,
    email: "fake@example.test",
    phone: "1234567",
    taxIdentification: null,
    systemOrigin: null,
    externalId: null,
    isActive: true,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: null,
    registeredByUserId: 9,
    leadId: 3
  }
  const mappedOrigin = { id: 1, name: "Referral", description: "Detail", isActive: false }
  const mappedStage = { id: 2, name: "Contact", order: -1, isFinal: false }
  const mappedLead = {
    id: 3,
    ...leadInput,
    isConverted: false,
    registeredAt: new Date("2026-01-01T00:00:00Z"),
    registeredByUserId: 9
  }
  const mappedContact = { id: 4, customerId: 7, ...contactInput }
  const mappedPreference = { id: 5, customerId: 7, ...preferenceInput }
  const mappedProperty = {
    id: 6,
    customerId: 7,
    ...propertyInput,
    isActive: false,
    createdAt: new Date("2026-01-01T00:00:00Z")
  }
  it("pins customer detail/create/replace/status/link methods and every mapped field", async () => {
    await check(customers.findById(7), "GET", "clientes/7", null, customer, mappedCustomer)
    const input = {
      name: "Customer",
      type: CustomerType.COMMERCIAL,
      email: "fake@example.test",
      phone: "1234567"
    }
    const body = {
      nombre: input.name,
      tipo: input.type,
      correo: input.email,
      telefono: input.phone
    }
    await check(customers.create(input), "POST", "clientes", body, customer, mappedCustomer)
    await check(
      customers.update({ id: 7, ...input }),
      "PUT",
      "clientes/7",
      body,
      customer,
      mappedCustomer
    )
    await check(
      customers.setStatus({ customerId: 7, isActive: false }),
      "PATCH",
      "clientes/7/estado",
      { activo: false },
      { ...customer, activo: false },
      { ...mappedCustomer, isActive: false }
    )
    await check(
      customers.linkAccount({ customerId: 7, userId: null }),
      "PUT",
      "clientes/7/cuenta",
      { idUsuario: null },
      customer,
      mappedCustomer
    )
  })
  it("pins acquisition catalogs, including inactive origins and signed stage order", async () => {
    const o = { name: "Referral", description: "Detail", isActive: false },
      ob = { nombre: "Referral", descripcion: "Detail", activo: false }
    await check(
      acquisition.listOrigins(),
      "GET",
      "catalogos/origenes-prospecto",
      null,
      [origin],
      [mappedOrigin]
    )
    await check(
      acquisition.createOrigin(o),
      "POST",
      "catalogos/origenes-prospecto",
      ob,
      origin,
      mappedOrigin
    )
    await check(
      acquisition.updateOrigin({ id: 1, ...o }),
      "PUT",
      "catalogos/origenes-prospecto/1",
      ob,
      origin,
      mappedOrigin
    )
    const s = { name: "Contact", order: -1, isFinal: false },
      sb = { nombre: "Contact", orden: -1, esFinal: false }
    await check(
      acquisition.listStages(),
      "GET",
      "catalogos/etapas-embudo",
      null,
      [stage],
      [mappedStage]
    )
    await check(
      acquisition.createStage(s),
      "POST",
      "catalogos/etapas-embudo",
      sb,
      stage,
      mappedStage
    )
    await check(
      acquisition.updateStage({ id: 2, ...s }),
      "PUT",
      "catalogos/etapas-embudo/2",
      sb,
      stage,
      mappedStage
    )
  })
  it("pins leads, followup and server-current conversion without sending copied profile", async () => {
    await check(acquisition.findLead(3), "GET", "prospectos/3", null, lead, mappedLead)
    await check(acquisition.createLead(leadInput), "POST", "prospectos", leadBody, lead, mappedLead)
    await check(
      acquisition.updateLead({ id: 3, ...leadInput, comentarioSeguimiento: null }),
      "PUT",
      "prospectos/3",
      { ...leadBody, comentarioSeguimiento: null },
      lead,
      mappedLead
    )
    await check(
      acquisition.updateLead({ id: 3, ...leadInput, comentarioSeguimiento: "Etapa anterior" }),
      "PUT",
      "prospectos/3",
      { ...leadBody, comentarioSeguimiento: "Etapa anterior" },
      lead,
      mappedLead
    )
    const follow = {
      idSeguimiento: 8,
      idProspecto: 3,
      idUsuario: 9,
      idEtapa: 2,
      comentario: null,
      fecha: "2026-01-01T00:00:00Z"
    }
    const mapped = {
      id: 8,
      leadId: 3,
      userId: 9,
      stageId: 2,
      comment: null,
      occurredAt: new Date("2026-01-01T00:00:00Z")
    }
    await check(
      acquisition.listFollowUps(3),
      "GET",
      "prospectos/3/seguimientos",
      null,
      [follow],
      [mapped]
    )
    await check(
      acquisition.addFollowUp({ leadId: 3, stageId: 2, comment: null }),
      "POST",
      "prospectos/3/seguimientos",
      { idEtapa: 2, comentario: null },
      follow,
      mapped
    )
    // An already-linked inactive customer is valid; the caller's type need not replace it.
    await check(
      acquisition.convertLead({ leadId: 3, type: CustomerType.RESIDENTIAL }),
      "POST",
      "prospectos/3/conversion",
      { tipo: "residencial" },
      { ...customer, activo: false },
      { ...mappedCustomer, isActive: false }
    )
  })
  it("maps aligned pagination and adopts actual effective size with documented max100", async () => {
    const pending = firstValueFrom(acquisition.listLeads({ offset: 200, limit: 200 }))
    const request = http.expectOne(r => r.url.endsWith("/api/prospectos"))
    expect(request.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    expect(request.request.params.get("pagina")).toBe("1")
    expect(request.request.params.get("tamanio")).toBe("200")
    request.flush(wirePage([lead], 101, 100, 1))
    expect(await pending).toEqual({
      success: true,
      data: { items: [mappedLead], offset: 100, limit: 100, total: 101 }
    })
  })
  it("pins contacts/preferences ownership, full PUT and null replacement", async () => {
    const cb = {
      nombre: "Contact",
      cargo: "Manager",
      correo: null,
      telefono: "1234567",
      principal: true,
      activo: false
    }
    await check(
      relations.listContacts(7),
      "GET",
      "clientes/7/contactos",
      null,
      [contact],
      [mappedContact]
    )
    await check(
      relations.createContact(7, contactInput),
      "POST",
      "clientes/7/contactos",
      cb,
      contact,
      mappedContact
    )
    await check(
      relations.updateContact(7, { id: 4, ...contactInput, position: null }),
      "PUT",
      "clientes/7/contactos/4",
      { ...cb, cargo: null },
      { ...contact, cargo: null },
      { ...mappedContact, position: null }
    )
    const pb = { idPropiedad: null, tipo: "Cleaning", detalle: "Detail", activo: true }
    await check(
      relations.listPreferences(7),
      "GET",
      "clientes/7/preferencias",
      null,
      [preference],
      [mappedPreference]
    )
    await check(
      relations.createPreference(7, preferenceInput),
      "POST",
      "clientes/7/preferencias",
      pb,
      preference,
      mappedPreference
    )
    await check(
      relations.updatePreference(7, { id: 5, ...preferenceInput }),
      "PUT",
      "clientes/7/preferencias/5",
      pb,
      preference,
      mappedPreference
    )
  })
  it("pins properties with authorized access fields and bounded canonical DECIMAL8,2", async () => {
    await check(
      properties.findByCustomer(7),
      "GET",
      "clientes/7/propiedades",
      null,
      [property],
      [mappedProperty]
    )
    await check(
      properties.create(7, propertyInput),
      "POST",
      "clientes/7/propiedades",
      propertyBody,
      property,
      mappedProperty
    )
    await check(
      properties.update(7, { id: 6, ...propertyInput }),
      "PUT",
      "clientes/7/propiedades/6",
      propertyBody,
      property,
      mappedProperty
    )
    await check(
      properties.setStatus(7, 6, true),
      "PATCH",
      "clientes/7/propiedades/6/estado",
      { activo: true },
      { ...property, activo: true },
      { ...mappedProperty, isActive: true }
    )
  })
  it.each([
    [0, "NETWORK"],
    [400, "INVALID_INPUT"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "CUSTOMER_NOT_FOUND"],
    [409, "CONFLICT"],
    [500, "UNEXPECTED"]
  ])("maps HTTP %s without exposing server text or retry", async (status, code) => {
    const pending = firstValueFrom(
      customers.update({
        id: 7,
        name: "Customer",
        type: CustomerType.COMMERCIAL,
        email: null,
        phone: null
      })
    )
    http
      .expectOne("http://localhost:8080/api/clientes/7")
      .flush(
        { mensaje: "sensitive backend text" },
        { status: Number(status), statusText: "Failure" }
      )
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    if (!result.success) expect(result.error.message).not.toContain("sensitive")
    http.expectNone(() => true)
  })
  it("rejects invalid input before HTTP (including alignment, IDs, fields and decimal scale)", async () => {
    const requests: Observable<unknown>[] = [
      customers.findById(0),
      customers.create({ name: " ", type: CustomerType.COMMERCIAL, email: null, phone: null }),
      acquisition.listLeads({ offset: 1, limit: 20 }),
      acquisition.findLead(2 ** 40),
      relations.createContact(7, { ...contactInput, email: "bad" }),
      properties.create(7, { ...propertyInput, areaM2: "1.001" }),
      properties.create(7, { ...propertyInput, doorCode: "x".repeat(31) })
    ]
    for (const stream of requests) {
      expect(await firstValueFrom(stream)).toMatchObject({
        success: false,
        error: { code: "INVALID_INPUT" }
      })
    }
    http.expectNone(() => true)
  })
  it("rejects malformed DTOs, wrong IDs/owners, duplicate lists, impossible pages and conversion links", async () => {
    const cases: [Observable<unknown>, string, object][] = [
      [customers.findById(7), "clientes/7", { ...customer, idCliente: 8 }],
      [customers.findPage(), "clientes?pagina=0&tamanio=20", wirePage([customer, customer])],
      [
        customers.findPage(),
        "clientes?pagina=0&tamanio=20",
        wirePage([{ ...customer, activo: false }])
      ],
      [customers.findById(7), "clientes/7", { ...customer, usuarioRegistro: undefined }],
      [customers.findById(7), "clientes/7", { ...customer, fechaCreacion: "2026-02-30T00:00:00Z" }],
      [relations.listContacts(7), "clientes/7/contactos", [{ ...contact, idCliente: 8 }]],
      [
        relations.updatePreference(7, { id: 5, ...preferenceInput }),
        "clientes/7/preferencias/5",
        { ...preference, idPreferencia: 6 }
      ],
      [properties.findByCustomer(7), "clientes/7/propiedades", [{ ...property, areaM2: 1.001 }]],
      [properties.findByCustomer(7), "clientes/7/propiedades", [{ ...property, idCliente: 8 }]],
      [
        acquisition.convertLead({ leadId: 3, type: CustomerType.COMMERCIAL }),
        "prospectos/3/conversion",
        { ...customer, idProspecto: 4 }
      ],
      [
        acquisition.listLeads({}),
        "prospectos?pagina=0&tamanio=20",
        { ...wirePage([lead]), totalPaginas: 8 }
      ],
      [acquisition.listStages(), "catalogos/etapas-embudo", [{ ...stage, esFinal: null }]]
    ]
    for (const [stream, path, dto] of cases) {
      const pending = firstValueFrom(stream)
      http.expectOne(`http://localhost:8080/api/${path}`).flush(dto)
      expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    }
  })
  it("cancels dispatched reads and writes without claiming remote rollback", () => {
    const requests: Observable<unknown>[] = [
      customers.findById(7),
      properties.create(7, propertyInput)
    ]
    for (const stream of requests) {
      const next = vi.fn(),
        subscription = stream.subscribe(next)
      const request = http.expectOne(() => true)
      subscription.unsubscribe()
      expect(request.cancelled).toBe(true)
      expect(next).not.toHaveBeenCalled()
    }
  })
})
describe("Customer HTTP platform/configuration safety", () => {
  it.each([
    [null, "browser"],
    ["http://localhost:8080", "server"],
    ["https://user:pass@example.test", "browser"],
    ["https://example.test/api", "browser"]
  ])("fails closed origin=%s platform=%s", async (origin, platform) => {
    setup(origin, platform!)
    const sources: Observable<unknown>[] = [
      TestBed.inject(CustomerHttpSource).findPage(),
      TestBed.inject(AcquisitionHttpSource).listOrigins(),
      TestBed.inject(PropertyHttpSource).findByCustomer(7),
      TestBed.inject(CustomerRelationsHttpSource).listContacts(7)
    ]
    for (const stream of sources)
      expect(await firstValueFrom(stream)).toMatchObject({
        success: false,
        error: { code: "UNCONFIGURED" }
      })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
