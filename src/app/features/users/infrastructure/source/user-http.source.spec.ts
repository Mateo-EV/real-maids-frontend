import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { Lang } from "../../domain/entities/user.entity"
import { UserRepositoryImpl } from "../repositories/user.repository-impl"
const endpoint = "http://localhost:8080/api/usuarios"
const dto = {
  idUsuario: 41,
  nombre: "Fake User",
  correo: "fake@example.test",
  idRol: 19,
  rol: "Backend role",
  idioma: "es",
  activo: true,
  ultimoAcceso: null,
  fechaCreacion: "2026-01-01T00:00:00Z",
  fechaActualizacion: "2026-01-02T01:02:03+00:00"
}
const page = { contenido: [dto], pagina: 0, tamanio: 500, totalElementos: 1, totalPaginas: 1 }
const input = {
  name: dto.nombre,
  email: dto.correo,
  password: " FakePassword1 ",
  roleId: dto.idRol,
  lang: Lang.ES,
  isActive: true
}

describe("wired users backend contract", () => {
  let repository: UserRepositoryImpl, http: HttpTestingController
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" }
      ]
    })
    repository = TestBed.inject(UserRepositoryImpl)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())
  it("maps server listing filters including false and zero without changing the catalog request", async () => {
    const pending = firstValueFrom(
      repository.getUsersPage({ page: 0, size: 10, search: "Fake", roleId: 0, isActive: false })
    )
    const request = http.expectOne(req => req.url === endpoint)
    expect(request.request.params.keys().sort()).toEqual([
      "activo",
      "busqueda",
      "idRol",
      "pagina",
      "tamanio"
    ])
    expect(request.request.params.get("busqueda")).toBe("Fake")
    expect(request.request.params.get("idRol")).toBe("0")
    expect(request.request.params.get("activo")).toBe("false")
    expect(request.request.params.get("pagina")).toBe("0")
    expect(request.request.params.get("tamanio")).toBe("10")
    expect(request.request.transferCache).toBe(false)
    request.flush({ ...page, tamanio: 5 })
    expect(await pending).toMatchObject({
      success: true,
      data: { items: [{ id: 41 }], page: 0, size: 5, total: 1, totalPages: 1 }
    })
  })
  it.each([
    { pagina: 1 },
    { tamanio: 0 },
    { tamanio: 11 },
    { tamanio: "5" },
    { totalElementos: -1 },
    { totalElementos: Number.MAX_SAFE_INTEGER + 1 },
    { totalPaginas: 0 },
    { totalPaginas: 1.5 },
    { contenido: [] },
    { contenido: [dto, dto], totalElementos: 2 },
    { contenido: [{ ...dto, activo: null }] }
  ])("rejects invalid listing metadata/items %j", async changed => {
    const pending = firstValueFrom(repository.getUsersPage({ page: 0, size: 10 }))
    http.expectOne(req => req.url === endpoint).flush({ ...page, tamanio: 5, ...changed })
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })
  it("validates effective size on later pages and allows empty out-of-range responses for bounded recovery", async () => {
    const pending = firstValueFrom(repository.getUsersPage({ page: 2, size: 10 }))
    http
      .expectOne(req => req.url === endpoint)
      .flush({ ...page, pagina: 2, tamanio: 5, totalElementos: 11, totalPaginas: 3 })
    expect(await pending).toMatchObject({ success: true, data: { page: 2, size: 5, total: 11 } })
    const empty = firstValueFrom(repository.getUsersPage({ page: 2, size: 10 }))
    http
      .expectOne(req => req.url === endpoint)
      .flush({ ...page, contenido: [], pagina: 2, tamanio: 5, totalElementos: 10, totalPaginas: 2 })
    expect(await empty).toMatchObject({ success: true, data: { items: [], page: 2 } })
  })
  it.each([
    { page: -1, size: 10 },
    { page: 0, size: 0 },
    { page: 0, size: 10, roleId: -1 },
    { page: 2147483648, size: 10 }
  ])("rejects invalid listing queries without HTTP %j", async query => {
    expect(await firstValueFrom(repository.getUsersPage(query))).toMatchObject({
      success: false,
      error: { code: "VALIDATION" }
    })
    http.expectNone(() => true)
  })
  it("cancels paged requests without affecting an independent catalog request", () => {
    const catalog = repository.getUsers().subscribe()
    const listing = repository.getUsersPage({ page: 0, size: 10 }).subscribe()
    const requests = http.match(req => req.url === endpoint)
    listing.unsubscribe()
    expect(requests[1].cancelled).toBe(true)
    expect(requests[0].cancelled).toBe(false)
    catalog.unsubscribe()
  })
  it("requests one fixed unfiltered catalog and returns only the entity array", async () => {
    const pending = firstValueFrom(repository.getUsers())
    const request = http.expectOne(req => req.url === endpoint)
    expect(request.request.params.get("pagina")).toBe("0")
    expect(request.request.params.get("tamanio")).toBe("500")
    expect(request.request.transferCache).toBe(false)
    request.flush(page)
    expect(request.request.params.keys().sort()).toEqual(["pagina", "tamanio"])
    expect(await pending).toMatchObject({ success: true, data: [{ id: 41 }] })
    http.expectNone(() => true)
  })
  it("never requests another page when totals exceed 500 and never exposes metadata", async () => {
    const pending = firstValueFrom(repository.getUsers())
    const request = http.expectOne(req => req.url === endpoint)
    expect(request.request.params.get("tamanio")).toBe("500")
    const records = Array.from({ length: 500 }, (_, idUsuario) => ({ ...dto, idUsuario }))
    request.flush({ ...page, contenido: records, totalElementos: 501, totalPaginas: 2 })
    const result = await pending
    expect(result.success && Array.isArray(result.data) && result.data.length).toBe(500)
    http.expectNone(() => true)
  })
  it("validates backend-capped metadata internally without exposing it or retrying", async () => {
    const pending = firstValueFrom(repository.getUsers())
    http.expectOne(req => req.url === endpoint).flush({ ...page, tamanio: 100 })
    expect(await pending).toMatchObject({ success: true, data: [{ id: 41 }] })
    http.expectNone(() => true)
  })
  it("maps backend profiles without retaining pagination metadata", async () => {
    const pending = firstValueFrom(repository.getUsers())
    http.expectOne(req => req.url === endpoint).flush(page)
    expect(await pending).toMatchObject({
      success: true,
      data: [
        { id: 41, name: dto.nombre, email: dto.correo, roleId: 19, lang: Lang.ES, lastAccess: null }
      ]
    })
  })
  it.each([
    null,
    {},
    { ...page, contenido: {} },
    { ...page, totalElementos: "101" },
    { ...page, pagina: 1 },
    { ...page, tamanio: 0 },
    { ...page, tamanio: -1 },
    { ...page, tamanio: 0.5 },
    { ...page, tamanio: "20" },
    { ...page, tamanio: Number.MAX_SAFE_INTEGER + 1 },
    { ...page, tamanio: 100, totalPaginas: 6 },
    { ...page, tamanio: 1, contenido: [dto, { ...dto, idUsuario: 42 }], totalPaginas: 101 },
    { ...page, totalElementos: 0, totalPaginas: 0 },
    { ...page, totalPaginas: 0 },
    { ...page, contenido: [dto, dto] },
    { ...page, contenido: [{ ...dto, idRol: "19" }] },
    { ...page, contenido: [{ ...dto, nombre: null }] },
    { ...page, contenido: [{ ...dto, activo: null }] },
    { ...page, contenido: [{ ...dto, idioma: "fr" }] },
    { ...page, contenido: [{ ...dto, ultimoAcceso: undefined }] },
    { ...page, contenido: [{ ...dto, fechaActualizacion: "2026-01-02" }] },
    { ...page, contenido: [{ ...dto, fechaCreacion: "2026-02-31T00:00:00Z" }] }
  ])("rejects malformed required consumer data %j", async value => {
    const pending = firstValueFrom(repository.getUsers())
    http.expectOne(req => req.url === endpoint).flush(value)
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })
  it("accepts a valid empty collection", async () => {
    const pending = firstValueFrom(repository.getUsers())
    http
      .expectOne(req => req.url === endpoint)
      .flush({ ...page, contenido: [], totalElementos: 0, totalPaginas: 0 })
    expect(await pending).toMatchObject({ success: true, data: [] })
  })
  it("creates using only documented fields, never retains age/password or invents dates", async () => {
    const pending = firstValueFrom(repository.createUser({ ...input, lastAccess: new Date() }))
    const request = http.expectOne(endpoint)
    expect(request.request.method).toBe("POST")
    expect(request.request.body).toEqual({
      nombre: input.name,
      correo: input.email,
      password: input.password,
      idRol: 19,
      idioma: "es",
      activo: true
    })
    request.flush({ ...dto, password: "must-not-retain", age: 99 })
    const result = await pending
    expect(result).toMatchObject({ success: true, data: { id: 41, roleId: 19 } })
    if (!result.success) throw result.error
    expect(result.data).not.toHaveProperty("age")
    expect(result.data).not.toHaveProperty("password")
    expect(result.data.createdAt.toISOString()).toBe("2026-01-01T00:00:00.000Z")
    expect(result.data.updatedAt.toISOString()).toBe("2026-01-02T01:02:03.000Z")
  })
  it("reads detail and maps explicit last access without fabricating omitted metadata", async () => {
    const pending = firstValueFrom(repository.getUserById(41))
    http.expectOne(`${endpoint}/41`).flush({ ...dto, ultimoAcceso: "2026-02-01T10:00:00Z" })
    expect(await pending).toMatchObject({
      success: true,
      data: { lastAccess: new Date("2026-02-01T10:00:00Z") }
    })
  })
  it("rejects a different identity returned from an ID-specific endpoint", async () => {
    const pending = firstValueFrom(repository.getUserById(41))
    http.expectOne(`${endpoint}/41`).flush({ ...dto, idUsuario: 42 })
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_RESPONSE" } })
  })
  it("reports a partial update when status fails without sending the later password write", async () => {
    const pending = firstValueFrom(repository.updateUserById(41, { ...input, isActive: false }))
    http.expectOne(`${endpoint}/41`).flush(dto)
    http.expectOne(`${endpoint}/41/estado`).flush(null, { status: 403, statusText: "Forbidden" })
    expect(await pending).toMatchObject({ success: false, error: { code: "PARTIAL_UPDATE" } })
    http.expectNone(`${endpoint}/41/password`)
  })
  it("updates profile, then state and password through distinct documented operations", async () => {
    const pending = firstValueFrom(repository.updateUserById(41, { ...input, isActive: false }))
    const profile = http.expectOne(`${endpoint}/41`)
    expect(profile.request.method).toBe("PUT")
    expect(profile.request.body).toEqual({
      nombre: input.name,
      correo: input.email,
      idRol: 19,
      idioma: "es"
    })
    profile.flush(dto)
    const state = http.expectOne(`${endpoint}/41/estado`)
    expect(state.request.method).toBe("PATCH")
    expect(state.request.body).toEqual({ activo: false })
    state.flush({ ...dto, activo: false })
    const password = http.expectOne(`${endpoint}/41/password`)
    expect(password.request.method).toBe("PUT")
    expect(password.request.body).toEqual({ passwordNueva: input.password })
    password.flush(null, { status: 204, statusText: "OK" })
    expect(await pending).toMatchObject({ success: true, data: { isActive: false } })
  })
  it("omits unchanged state and blank optional password", async () => {
    const pending = firstValueFrom(repository.updateUserById(41, { ...input, password: "" }))
    http.expectOne(`${endpoint}/41`).flush(dto)
    expect((await pending).success).toBe(true)
    http.expectNone(`${endpoint}/41/password`)
    http.expectNone(`${endpoint}/41/estado`)
  })
  it("does not claim transactional success when password reset fails after profile success", async () => {
    const pending = firstValueFrom(repository.updateUserById(41, input))
    http.expectOne(`${endpoint}/41`).flush(dto)
    http
      .expectOne(`${endpoint}/41/password`)
      .flush({ secret: "not exposed" }, { status: 403, statusText: "Forbidden" })
    expect(await pending).toMatchObject({ success: false, error: { code: "PARTIAL_UPDATE" } })
    http.expectNone(`${endpoint}/41`)
  })
  it.each([200, 204])("accepts successful empty delete %s", async status => {
    const pending = firstValueFrom(repository.deleteUserById(41))
    const request = http.expectOne(`${endpoint}/41`)
    expect(request.request.method).toBe("DELETE")
    request.flush(null, { status, statusText: "OK" })
    expect((await pending).success).toBe(true)
  })
  it.each([
    [400, "VALIDATION"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "USER_NOT_FOUND"],
    [409, "EMAIL_ALREADY_EXISTS"],
    [500, "UNEXPECTED"]
  ])("maps raw HTTP %s without exposing backend bodies", async (status, code) => {
    const pending = firstValueFrom(repository.createUser(input))
    http
      .expectOne(endpoint)
      .flush({ sensitive: "not exposed" }, { status: Number(status), statusText: "Failure" })
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    expect(JSON.stringify(result)).not.toContain("not exposed")
    http.expectNone(endpoint)
  })
  it("maps network errors safely and does not retry writes", async () => {
    const pending = firstValueFrom(repository.createUser(input))
    http.expectOne(endpoint).error(new ProgressEvent("error"))
    expect(await pending).toMatchObject({ success: false, error: { code: "NETWORK" } })
    http.expectNone(endpoint)
  })
  it("aborts an unsubscribed request rather than producing a late success", () => {
    const subscription = repository.createUser(input).subscribe()
    const request = http.expectOne(endpoint)
    subscription.unsubscribe()
    expect(request.cancelled).toBe(true)
  })
  it.each(["server", "unconfigured"])("fails closed for %s without requests", async mode => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PLATFORM_ID, useValue: mode === "server" ? "server" : "browser" },
        { provide: API_URL, useValue: mode === "unconfigured" ? null : "http://localhost:8080" }
      ]
    })
    const repo = TestBed.inject(UserRepositoryImpl)
    expect((await firstValueFrom(repo.getUsers())).success).toBe(false)
    expect((await firstValueFrom(repo.getUsersPage({ page: 0, size: 10 }))).success).toBe(false)
    expect((await firstValueFrom(repo.createUser(input))).success).toBe(false)
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
