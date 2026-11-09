import { TestBed } from "@angular/core/testing"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom } from "rxjs"
import { beforeEach, afterEach, describe, it, expect } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { CustomerType } from "../../domain/entities/customer.entity"
import { CustomerRepositoryImpl } from "../repositories/customer.repository-impl"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { CustomerListQuery } from "../../domain/models/customer-list-query"

export const customerDto = {
  idCliente: 7,
  nombre: "Customer",
  tipo: "residencial",
  correo: null,
  telefono: null,
  activo: true,
  idUsuario: 11,
  fechaCreacion: "2026-01-01T12:00:00-05:00",
  fechaActualizacion: null,
  idProspecto: 3,
  identificacionFiscal: "Tax",
  sistemaOrigen: "Legacy",
  idExterno: "external-9",
  usuarioRegistro: 12
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

describe("Customer real HTTP boundary", () => {
  let repository: CustomerRepositoryImpl, http: HttpTestingController
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" }
      ]
    })
    repository = TestBed.inject(CustomerRepositoryImpl)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())

  it("reads the active-only server page and preserves every item's real extended metadata", async () => {
    const pending = firstValueFrom(repository.findPage())
    const request = http.expectOne("http://localhost:8080/api/clientes?pagina=0&tamanio=20")
    expect(request.request.method).toBe("GET")
    expect(request.request.params.keys()).toEqual(["pagina", "tamanio"])
    expect(request.request.transferCache).toBe(false)
    const second = {
      ...customerDto,
      idCliente: 8,
      nombre: "Second",
      idProspecto: null,
      idUsuario: null,
      correo: "second@example.test",
      telefono: "+1 555 010 1001"
    }
    request.flush(wirePage([customerDto, second]))
    const result = await pending
    expect(result.success).toBe(true)
    if (result.success)
      expect(result.data).toEqual({
        total: 2,
        offset: 0,
        limit: 20,
        items: [customerDto, second].map(c => ({
          id: c.idCliente,
          name: c.nombre,
          type: c.tipo,
          email: c.correo,
          phone: c.telefono,
          isActive: c.activo,
          userId: c.idUsuario,
          leadId: c.idProspecto,
          taxIdentification: c.identificacionFiscal,
          systemOrigin: c.sistemaOrigen,
          externalId: c.idExterno,
          registeredByUserId: c.usuarioRegistro,
          updatedAt: null,
          createdAt: new Date("2026-01-01T17:00:00Z")
        }))
      })
  })

  it.each([
    { query: { offset: 400, limit: 200 }, number: 2, size: 100, total: 201, items: [customerDto] },
    { query: { offset: 40, limit: 20 }, number: 2, size: 20, total: 1, items: [] },
    { query: {}, number: 0, size: 20, total: 0, items: [] }
  ])(
    "adopts effective metadata without slicing or clamping out-of-range pages: $query",
    async ({ query, number, size, total, items }) => {
      const pending = firstValueFrom(repository.findPage(query))
      const request = http.expectOne(
        `http://localhost:8080/api/clientes?pagina=${number}&tamanio=${query.limit ?? 20}`
      )
      expect(request.request.method).toBe("GET")
      expect(request.request.transferCache).toBe(false)
      request.flush(wirePage(items, number, size, total))
      expect(await pending).toMatchObject({
        success: true,
        data: {
          items: items.map(c => expect.objectContaining({ id: c.idCliente })),
          offset: number * size,
          limit: size,
          total
        }
      })
    }
  )

  it("maps normalized optional search and type filters without changing server pagination", async () => {
    const pending = firstValueFrom(
      repository.findPage({
        offset: 20,
        limit: 5,
        search: "  Ana Pérez  ",
        type: CustomerType.COMMERCIAL
      })
    )
    const request = http.expectOne(
      "http://localhost:8080/api/clientes?pagina=4&tamanio=5&busqueda=Ana%20P%C3%A9rez&tipo=comercial"
    )
    expect(request.request.params.keys()).toEqual(["pagina", "tamanio", "busqueda", "tipo"])
    request.flush(wirePage([], 4, 5, 0))
    expect(await pending).toMatchObject({ success: true, data: { offset: 20, limit: 5 } })
  })

  it("preserves search metacharacters literally for the backend to interpret", async () => {
    const pending = firstValueFrom(repository.findPage({ search: " A%_\\\\B " }))
    const request = http.expectOne(
      "http://localhost:8080/api/clientes?pagina=0&tamanio=20&busqueda=A%25_%5C%5CB"
    )
    expect(request.request.params.get("busqueda")).toBe("A%_\\\\B")
    request.flush(wirePage([]))
    expect(await pending).toMatchObject({ success: true })
  })

  it("rejects invalid runtime customer types before HTTP", async () => {
    const query = { offset: 0, limit: 20, type: "unknown" } as unknown as CustomerListQuery
    expect(await firstValueFrom(repository.findPage(query))).toMatchObject({
      success: false,
      error: { code: "INVALID_INPUT" }
    })
    http.expectNone(() => true)
  })

  it("omits blank and absent filters for the default listing", async () => {
    const pending = firstValueFrom(
      repository.findPage({ offset: 0, limit: 20, search: "  ", type: undefined })
    )
    const request = http.expectOne("http://localhost:8080/api/clientes?pagina=0&tamanio=20")
    expect(request.request.params.keys()).toEqual(["pagina", "tamanio"])
    request.flush(wirePage([]))
    expect(await pending).toMatchObject({ success: true, data: { total: 0, offset: 0, limit: 20 } })
  })

  it.each<PaginationParams>([
    { offset: -1 },
    { offset: 1, limit: 20 },
    { limit: 0 },
    { limit: -1 },
    { offset: Number.MAX_SAFE_INTEGER + 1 },
    { limit: 1.5 },
    { limit: 2147483648 },
    { offset: 2147483648, limit: 1 },
    { offset: NaN },
    { limit: Infinity }
  ])("rejects invalid query before HTTP: %j", async query => {
    expect(await firstValueFrom(repository.findPage(query))).toMatchObject({
      success: false,
      error: { code: "INVALID_INPUT" }
    })
    http.expectNone(() => true)
  })

  it("accepts customer-specific filter query typing without widening shared pagination", () => {
    const query: CustomerListQuery = {
      offset: 15,
      limit: 5,
      search: " Ana ",
      type: CustomerType.RESIDENTIAL
    }
    expect(query).toMatchObject({ offset: 15, limit: 5, search: " Ana ", type: "residencial" })
  })

  it.each(
    [
      [customerDto],
      wirePage([customerDto, customerDto]),
      wirePage([{ ...customerDto, activo: false }]),
      { ...wirePage([customerDto]), contenido: null },
      { ...wirePage([customerDto]), pagina: 1 },
      { ...wirePage([customerDto]), tamanio: 101 },
      { ...wirePage([customerDto]), tamanio: 0 },
      { ...wirePage([customerDto]), totalElementos: -1 },
      { ...wirePage([customerDto]), totalElementos: Number.MAX_SAFE_INTEGER + 1 },
      { ...wirePage([customerDto]), totalPaginas: 2 },
      { ...wirePage([customerDto]), totalElementos: 2 },
      wirePage([{ ...customerDto, idProspecto: undefined }])
    ].map(dto => ({ dto }))
  )("rejects old arrays and malformed pages without exposing data: %j", async ({ dto }) => {
    const pending = firstValueFrom(repository.findPage())
    http.expectOne("http://localhost:8080/api/clientes?pagina=0&tamanio=20").flush(dto)
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    expect(result).not.toHaveProperty("data")
  })
})
