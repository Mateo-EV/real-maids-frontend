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
