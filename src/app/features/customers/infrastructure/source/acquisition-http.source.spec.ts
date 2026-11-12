import { TestBed } from "@angular/core/testing"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom } from "rxjs"
import { beforeEach, afterEach, describe, it, expect } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { AcquisitionRepositoryImpl } from "../repositories/acquisition.repository-impl"
import { LeadListQuery } from "../../domain/models/lead-list-query"

const leadWire = {
  idProspecto: 7,
  idOrigen: 11,
  idEtapa: 12,
  nombre: "Prospecto",
  correo: null,
  telefono: null,
  direccionReferencia: null,
  observacion: null,
  convertido: false,
  fechaRegistro: "2026-01-01T12:00:00-05:00",
  usuarioRegistro: null
}
const wirePage = (
  contenido: unknown[] = [],
  pagina = 0,
  tamanio = 20,
  total = contenido.length
) => ({
  contenido,
  pagina,
  tamanio,
  totalElementos: total,
  totalPaginas: Math.ceil(total / tamanio)
})
const url = (query: string) => `http://localhost:8080/api/prospectos?${query}`

describe("Acquisition lead list HTTP boundary", () => {
  let repository: AcquisitionRepositoryImpl, http: HttpTestingController
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" }
      ]
    })
    repository = TestBed.inject(AcquisitionRepositoryImpl)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())

  it("keeps the unfiltered listing on pagina/tamanio and preserves the documented lead projection", async () => {
    const pending = firstValueFrom(repository.listLeads({}))
    const request = http.expectOne(url("pagina=0&tamanio=20"))
    expect(request.request.method).toBe("GET")
    expect(request.request.params.keys()).toEqual(["pagina", "tamanio"])
    expect(request.request.transferCache).toBe(false)
    request.flush(wirePage([leadWire]))
    expect(await pending).toEqual({
      success: true,
      data: {
        items: [
          {
            id: 7,
            originId: 11,
            stageId: 12,
            name: "Prospecto",
            email: null,
            phone: null,
            referenceAddress: null,
            observation: null,
            isConverted: false,
            registeredAt: new Date("2026-01-01T17:00:00Z"),
            registeredByUserId: null
          }
        ],
        offset: 0,
        limit: 20,
        total: 1
      }
    })
  })

  it("maps the four server filters without changing server pagination", async () => {
    const pending = firstValueFrom(
      repository.listLeads({
        offset: 20,
        limit: 5,
        search: "  Ana Pérez  ",
        originId: 11,
        stageId: 12,
        converted: false
      })
    )
    const request = http.expectOne(
      url("pagina=4&tamanio=5&busqueda=Ana%20P%C3%A9rez&idOrigen=11&idEtapa=12&convertido=false")
    )
    expect(request.request.params.keys()).toEqual([
      "pagina",
      "tamanio",
      "busqueda",
      "idOrigen",
      "idEtapa",
      "convertido"
    ])
    expect(request.request.params.get("convertido")).toBe("false")
    expect(request.request.transferCache).toBe(false)
    request.flush(wirePage([], 4, 5, 0))
    expect(await pending).toMatchObject({ success: true, data: { offset: 20, limit: 5 } })
  })

  it("preserves literal search text and an explicit true conversion choice", async () => {
    const pending = firstValueFrom(repository.listLeads({ search: " A%_\\\\B ", converted: true }))
    const request = http.expectOne(url("pagina=0&tamanio=20&busqueda=A%25_%5C%5CB&convertido=true"))
    expect(request.request.params.get("busqueda")).toBe("A%_\\\\B")
    expect(request.request.params.get("convertido")).toBe("true")
    request.flush(wirePage())
    expect(await pending).toMatchObject({ success: true })
  })

  it("omits blank search and malformed filter ids instead of sending them", async () => {
    const query = {
      offset: 0,
      limit: 20,
      search: "   ",
      originId: 0,
      stageId: 1.5,
      converted: "yes"
    } as unknown as LeadListQuery
    const pending = firstValueFrom(repository.listLeads(query))
    const request = http.expectOne(url("pagina=0&tamanio=20"))
    expect(request.request.params.keys()).toEqual(["pagina", "tamanio"])
    request.flush(wirePage())
    expect(await pending).toMatchObject({ success: true })
  })
})

describe("Acquisition lead deletion HTTP boundary", () => {
  let repository: AcquisitionRepositoryImpl, http: HttpTestingController
  const leadUrl = "http://localhost:8080/api/prospectos/7"
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" }
      ]
    })
    repository = TestBed.inject(AcquisitionRepositoryImpl)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())

  it("sends one cold bodyless DELETE and confirms success on 204", async () => {
    const pending = firstValueFrom(repository.deleteLead(7))
    const request = http.expectOne(leadUrl)
    expect(request.request.method).toBe("DELETE")
    expect(request.request.body).toBeNull()
    expect(request.request.transferCache).toBe(false)
    expect(request.request.params.keys()).toEqual([])
    request.flush(null, { status: 204, statusText: "No Content" })
    expect(await pending).toMatchObject({ success: true })
    expect(request.request.url).toBe(leadUrl)
    http.expectNone(leadUrl)
  })

  it.each([
    [404, "LEAD_NOT_FOUND", "Not Found"],
    [409, "CONFLICT", "Conflict"],
    [403, "FORBIDDEN", "Forbidden"],
    [401, "UNAUTHENTICATED", "Unauthorized"]
  ])("maps HTTP %s to %s without exposing the backend message", async (status, code, text) => {
    const pending = firstValueFrom(repository.deleteLead(7))
    http
      .expectOne(leadUrl)
      .flush(
        { mensaje: "El prospecto 7 está convertido y no puede eliminarse" },
        { status, statusText: text }
      )
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    expect(JSON.stringify(result)).not.toContain("convertido y no puede eliminarse")
    http.expectNone(leadUrl)
  })

  it("maps a network failure safely and rejects malformed ids before any request", async () => {
    const offline = firstValueFrom(repository.deleteLead(7))
    http
      .expectOne(leadUrl)
      .error(new ProgressEvent("error"), { status: 0, statusText: "Unknown Error" })
    expect(await offline).toMatchObject({ success: false, error: { code: "NETWORK" } })
    for (const id of [0, -3, 1.5, 2147483648]) {
      expect(await firstValueFrom(repository.deleteLead(id))).toMatchObject({
        success: false,
        error: { code: "INVALID_INPUT" }
      })
    }
    // afterEach verify() also fails if a malformed id produced any unmatched request.
    http.expectNone(leadUrl)
  })
})

describe("Acquisition prospect statistics HTTP boundary", () => {
  let repository: AcquisitionRepositoryImpl, http: HttpTestingController
  const statisticsUrl = "http://localhost:8080/api/prospectos/estadisticas"
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" }
      ]
    })
    repository = TestBed.inject(AcquisitionRepositoryImpl)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())

  it("reads the frozen aggregate from GET /api/prospectos/estadisticas without deriving its counts", async () => {
    const pending = firstValueFrom(repository.getLeadStatistics())
    const request = http.expectOne(statisticsUrl)
    expect(request.request.method).toBe("GET")
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.transferCache).toBe(false)
    request.flush({ total: 42, convertidos: 12, pendientes: 30 })
    expect(await pending).toEqual({
      success: true,
      data: { total: 42, convertidos: 12, pendientes: 30 }
    })
  })

  it("rejects incomplete, negative or non-integer counts and unknown payload shapes", async () => {
    const payloads: (object | null)[] = [
      {},
      { total: 1, convertidos: 1 },
      { convertidos: 1, pendientes: 0 },
      { total: -1, convertidos: 0, pendientes: 0 },
      { total: 1.5, convertidos: 1, pendientes: 0 },
      { total: "2", convertidos: 1, pendientes: 1 },
      null,
      []
    ]
    for (const payload of payloads) {
      const pending = firstValueFrom(repository.getLeadStatistics())
      http.expectOne(statisticsUrl).flush(payload)
      expect(await pending).toMatchObject({
        success: false,
        error: { code: "INVALID_RESPONSE" }
      })
    }
  })

  it("maps server denials and returns no borrowed counts", async () => {
    const denied = firstValueFrom(repository.getLeadStatistics())
    http.expectOne(statisticsUrl).flush({}, { status: 403, statusText: "Forbidden" })
    expect(await denied).toMatchObject({ success: false, error: { code: "FORBIDDEN" } })
    const offline = firstValueFrom(repository.getLeadStatistics())
    http
      .expectOne(statisticsUrl)
      .error(new ProgressEvent("error"), { status: 0, statusText: "Unknown Error" })
    expect(await offline).toMatchObject({ success: false, error: { code: "NETWORK" } })
  })
})
