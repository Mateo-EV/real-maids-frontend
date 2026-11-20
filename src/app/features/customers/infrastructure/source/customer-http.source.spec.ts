import { TestBed } from "@angular/core/testing"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom } from "rxjs"
import { beforeEach, afterEach, describe, it, expect } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { Result } from "@/app/shared/utils/result"
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
  usuarioActivo: true,
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
      usuarioActivo: null,
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
          accountActive: c.usuarioActivo,
          accountStateUnknown: false,
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
      wirePage([{ ...customerDto, idProspecto: undefined }]),
      wirePage([{ ...customerDto, usuarioActivo: null }]),
      wirePage([{ ...customerDto, usuarioActivo: "true" }]),
      wirePage([{ ...customerDto, idUsuario: null }])
    ].map(dto => ({ dto }))
  )("rejects old arrays and malformed pages without exposing data: %j", async ({ dto }) => {
    const pending = firstValueFrom(repository.findPage())
    http.expectOne("http://localhost:8080/api/clientes?pagina=0&tamanio=20").flush(dto)
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    expect(result).not.toHaveProperty("data")
  })

  it("keeps a legacy payload readable when it predates usuarioActivo and flags the state as unknown", async () => {
    const legacy: Record<string, unknown> = { ...customerDto, idUsuario: 11 }
    delete legacy["usuarioActivo"]
    const pending = firstValueFrom(repository.findPage())
    http
      .expectOne("http://localhost:8080/api/clientes?pagina=0&tamanio=20")
      .flush(wirePage([legacy]))
    const result = await pending
    expect(result.success).toBe(true)
    expect(result.success && result.data.items[0]).toMatchObject({
      userId: 11,
      accountActive: null,
      accountStateUnknown: true
    })
  })

  it.each([
    [null, null],
    [true, 11],
    [false, 11]
  ] as const)(
    "distinguishes no account, an active account and a deactivated account from usuarioActivo (%s)",
    async (usuarioActivo, idUsuario) => {
      const pending = firstValueFrom(repository.findById(7))
      http
        .expectOne("http://localhost:8080/api/clientes/7")
        .flush({ ...customerDto, idUsuario, usuarioActivo })
      const result = await pending
      expect(result.success && result.data).toMatchObject({
        userId: idUsuario,
        accountActive: usuarioActivo
      })
    }
  )

  it("keeps a response readable when it predates the account state, and marks that state unknown", async () => {
    const legacy: Record<string, unknown> = { ...customerDto, idUsuario: null }
    delete legacy["usuarioActivo"]
    const pending = firstValueFrom(repository.findById(7))
    http.expectOne("http://localhost:8080/api/clientes/7").flush(legacy)
    expect(await pending).toMatchObject({
      success: true,
      data: { userId: null, accountActive: null, accountStateUnknown: false }
    })
    // A named account without the field is a legacy payload: readable, but never mutated by the editor.
    const withoutState = firstValueFrom(repository.findById(7))
    http.expectOne("http://localhost:8080/api/clientes/7").flush({ ...legacy, idUsuario: 11 })
    expect(await withoutState).toMatchObject({
      success: true,
      data: { userId: 11, accountActive: null, accountStateUnknown: true }
    })
    // An explicit null next to an id stays contradictory.
    const contradictory = firstValueFrom(repository.findById(7))
    http
      .expectOne("http://localhost:8080/api/clientes/7")
      .flush({ ...legacy, idUsuario: 11, usuarioActivo: null })
    expect(await contradictory).toMatchObject({
      success: false,
      error: { code: "INVALID_RESPONSE" }
    })
  })

  it("keeps the account tri-state in the write body instead of collapsing absent and false", async () => {
    const profile = {
      name: "Ana",
      type: CustomerType.RESIDENTIAL,
      email: "ana@example.test",
      phone: null
    }
    const absent = firstValueFrom(repository.create(profile))
    let request = http.expectOne("http://localhost:8080/api/clientes")
    expect(request.request.method).toBe("POST")
    expect(request.request.body).toEqual({
      nombre: "Ana",
      tipo: "residencial",
      correo: "ana@example.test",
      telefono: null
    })
    expect(Object.keys(request.request.body)).not.toContain("crearCuenta")
    expect(Object.keys(request.request.body)).not.toContain("password")
    request.flush(customerDto)
    expect((await absent).success).toBe(true)

    const requested = firstValueFrom(
      repository.create({ ...profile, createAccount: true, password: "Clave1234" })
    )
    request = http.expectOne("http://localhost:8080/api/clientes")
    expect(request.request.body).toEqual({
      nombre: "Ana",
      tipo: "residencial",
      correo: "ana@example.test",
      telefono: null,
      crearCuenta: true,
      password: "Clave1234"
    })
    request.flush(customerDto)
    expect((await requested).success).toBe(true)

    const retired = firstValueFrom(repository.update({ id: 7, ...profile, createAccount: false }))
    request = http.expectOne("http://localhost:8080/api/clientes/7")
    expect(request.request.method).toBe("PUT")
    expect(request.request.body).toEqual({
      nombre: "Ana",
      tipo: "residencial",
      correo: "ana@example.test",
      telefono: null,
      crearCuenta: false
    })
    expect(Object.keys(request.request.body)).not.toContain("password")
    request.flush({ ...customerDto, usuarioActivo: null, idUsuario: null })
    expect((await retired).success).toBe(true)

    // The same flag recreates a deactivated row on edit, so the password travels with `true` there too.
    const recreated = firstValueFrom(
      repository.update({ id: 7, ...profile, createAccount: true, password: "Nueva1234" })
    )
    request = http.expectOne("http://localhost:8080/api/clientes/7")
    expect(request.request.body).toEqual({
      nombre: "Ana",
      tipo: "residencial",
      correo: "ana@example.test",
      telefono: null,
      crearCuenta: true,
      password: "Nueva1234"
    })
    request.flush(customerDto)
    expect((await recreated).success).toBe(true)
  })

  it.each([
    { createAccount: true },
    { createAccount: true, password: "" },
    { createAccount: true, password: "Clave1234", email: null },
    { password: "Clave1234" },
    { createAccount: false, password: "Clave1234" }
  ])("rejects an inconsistent account request before HTTP: %j", async account => {
    const result = await firstValueFrom(
      repository.create({
        name: "Ana",
        type: CustomerType.RESIDENTIAL,
        email: "ana@example.test",
        phone: null,
        ...account
      })
    )
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_INPUT" } })
    http.expectNone(() => true)
  })

  it("decodes only the three documented conditional account markers from a validation body", async () => {
    const profile = {
      name: "Ana",
      type: CustomerType.RESIDENTIAL,
      email: "ana@example.test",
      phone: null,
      createAccount: true,
      password: "Clave1234"
    }
    for (const [marker, code] of [
      ["correoParaCuenta", "ACCOUNT_EMAIL_REQUIRED"],
      ["passwordParaCuenta", "ACCOUNT_PASSWORD_REQUIRED"],
      ["passwordSoloConCuenta", "ACCOUNT_PASSWORD_WITHOUT_ACCOUNT"]
    ] as const) {
      const pending = firstValueFrom(repository.create(profile))
      http
        .expectOne("http://localhost:8080/api/clientes")
        .flush(
          { codigo: 400, mensaje: "Private text must not reach UI", errores: { [marker]: "x" } },
          { status: 400, statusText: "Bad Request" }
        )
      const result = await pending
      expect(!result.success && result.error.code).toBe(code)
    }
    // Any other validation body keeps the generic mapping; no invented field attribution.
    for (const body of [
      { errores: { password: "x" } },
      { errores: { correoParaCuenta2: "x" } },
      { errores: "correoParaCuenta" },
      { mensaje: "correoParaCuenta" }
    ]) {
      const pending = firstValueFrom(repository.update({ id: 7, ...profile }))
      http
        .expectOne("http://localhost:8080/api/clientes/7")
        .flush(body, { status: 400, statusText: "Bad Request" })
      const result = await pending
      expect(!result.success && result.error.code).toBe("INVALID_INPUT")
    }
  })

  it("reads the server customer statistics aggregate from its own documented endpoint", async () => {
    const pending = firstValueFrom(repository.findStatistics())
    const request = http.expectOne("http://localhost:8080/api/clientes/estadisticas")
    expect(request.request.method).toBe("GET")
    expect(request.request.params.keys()).toEqual([])
    expect(request.request.transferCache).toBe(false)
    request.flush({ total: 32, activos: 30, inactivos: 2 })
    expect(await pending).toEqual(Result.success({ total: 32, activos: 30, inactivos: 2 }))
  })

  it.each(
    [
      { total: 32, activos: 30 },
      { total: 32, activos: 30, inactivos: -1 },
      { total: 32, activos: 30, inactivos: 2.5 },
      { total: "32", activos: 30, inactivos: 2 },
      { total: 32, activos: Number.MAX_SAFE_INTEGER + 1, inactivos: 0 },
      [32, 30, 2],
      null
    ].map(dto => ({ dto }))
  )("rejects a malformed statistics aggregate without inventing counts: %j", async ({ dto }) => {
    const pending = firstValueFrom(repository.findStatistics())
    http.expectOne("http://localhost:8080/api/clientes/estadisticas").flush(dto)
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
    expect(result).not.toHaveProperty("data")
  })
})
