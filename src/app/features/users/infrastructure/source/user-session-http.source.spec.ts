import { TestBed } from "@angular/core/testing"
import { PLATFORM_ID } from "@angular/core"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { UserSessionHttpSource } from "./user-session-http.source"

const dto = (overrides = {}) => ({
  idSesion: 17,
  idUsuario: 42,
  nombreUsuario: "Usuario real",
  correoUsuario: "real@example.test",
  ip: "192.0.2.1",
  dispositivo: "Navegador",
  fechaInicio: "2026-01-01T10:00:00Z",
  fechaExpiracion: "2026-01-02T10:00:00Z",
  actual: false,
  ...overrides
})
const page = (contenido: unknown[] = [dto()], overrides = {}) => ({
  contenido,
  pagina: 0,
  tamanio: 20,
  totalElementos: contenido.length,
  totalPaginas: contenido.length ? 1 : 0,
  ...overrides
})
describe("UserSessionHttpSource", () => {
  let source: UserSessionHttpSource, http: HttpTestingController
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" }
      ]
    })
    source = TestBed.inject(UserSessionHttpSource)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => http.verify())
  it("maps backend ownership, caller-relative actual and server totals independent of page length", async () => {
    const pending = firstValueFrom(source.getUserSessions({ userId: 42, page: 1, size: 1 }))
    const req = http.expectOne("http://localhost:8080/api/sesiones?pagina=1&tamanio=1&idUsuario=42")
    expect(req.request.transferCache).toBe(false)
    req.flush(
      page([dto({ actual: true })], { pagina: 1, tamanio: 1, totalElementos: 30, totalPaginas: 30 })
    )
    const result = await pending
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.total).toBe(30)
      expect(result.data.items[0]).toMatchObject({
        id: 17,
        userId: 42,
        userName: "Usuario real",
        isCurrent: true
      })
      expect(result.data.items[0].startDate).toEqual(new Date("2026-01-01T10:00:00Z"))
    }
  })
  it("loads a complete per-user list without pagination or inventing current metadata", async () => {
    const pending = firstValueFrom(source.getUserSessionsByUser(42))
    http
      .expectOne("http://localhost:8080/api/usuarios/42/sesiones")
      .flush([dto(), dto({ idSesion: 18, actual: true })])
    const result = await pending
    expect(result.success && result.data.map(s => s.isCurrent)).toEqual([false, true])
  })
  it.each([
    [dto({ idSesion: 1.5 })],
    [dto({ idUsuario: 2147483648 })],
    [dto({ actual: null })],
    [dto({ nombreUsuario: null })],
    [dto({ correoUsuario: "bad" })],
    [dto({ dispositivo: "" })],
    [dto({ fechaInicio: "2026-02-30T10:00:00Z" })],
    [dto({ fechaInicio: "2026-01-01T24:00:00Z" })],
    [dto({ fechaExpiracion: "2025-01-01T10:00:00Z" })],
    [dto(), dto()],
    [dto({ actual: true }), dto({ idSesion: 18, actual: true })],
    [dto(), dto({ idSesion: 18, nombreUsuario: "Otro nombre" })]
  ])("rejects malformed, duplicate or inconsistent DTOs %#", async (...records) => {
    const pending = firstValueFrom(source.getUserSessions())
    http.expectOne("http://localhost:8080/api/sesiones?pagina=0&tamanio=20").flush(page(records))
    const result = await pending
    expect(!result.success && result.error.code).toBe("INVALID_RESPONSE")
  })
  it.each([
    { totalElementos: -1 },
    { totalElementos: 21, totalPaginas: 1 },
    { pagina: 1 },
    { tamanio: 2 },
    { totalElementos: 2 },
    { totalPaginas: 1.5 }
  ])("rejects inconsistent page metadata %j", async overrides => {
    const pending = firstValueFrom(source.getUserSessions())
    http
      .expectOne("http://localhost:8080/api/sesiones?pagina=0&tamanio=20")
      .flush(page([dto()], overrides))
    expect((await pending).success).toBe(false)
  })
  it("rejects records belonging to another requested user", async () => {
    const pending = firstValueFrom(source.getUserSessionsByUser(43))
    http.expectOne("http://localhost:8080/api/usuarios/43/sesiones").flush([dto()])
    const result = await pending
    expect(!result.success && result.error.code).toBe("INVALID_RESPONSE")
  })
  it("rejects non-newest-first page ordering", async () => {
    const pending = firstValueFrom(source.getUserSessions())
    http
      .expectOne("http://localhost:8080/api/sesiones?pagina=0&tamanio=20")
      .flush(page([dto(), dto({ idSesion: 18, fechaInicio: "2026-01-01T11:00:00Z" })]))
    expect((await pending).success).toBe(false)
  })
  it.each([
    { page: -1 },
    { size: 0 },
    { userId: Number.NaN },
    { page: null as unknown as number },
    { size: null as unknown as number }
  ])("rejects invalid queries without requests %j", async query => {
    const result = await firstValueFrom(source.getUserSessions(query))
    expect(!result.success && result.error.code).toBe("INVALID_QUERY")
  })
  it.each([200, 204])(
    "accepts empty %i individual and bulk revocation without guessing retained sessions",
    async status => {
      let pending = firstValueFrom(source.revokeUserSession(42, 17))
      const req = http.expectOne("http://localhost:8080/api/usuarios/42/sesiones/17")
      expect(req.request.method).toBe("DELETE")
      req.flush(null, { status, statusText: "OK" })
      expect((await pending).success).toBe(true)
      pending = firstValueFrom(source.revokeUserSessions(42))
      http
        .expectOne("http://localhost:8080/api/usuarios/42/sesiones")
        .flush(null, { status, statusText: "OK" })
      expect((await pending).success).toBe(true)
    }
  )
  it.each([
    [400, "VALIDATION"],
    [401, "UNAUTHENTICATED"],
    [403, "FORBIDDEN"],
    [404, "SESSION_NOT_FOUND"],
    [500, "UNEXPECTED"]
  ])("maps %i safely and never retries writes", async (status, expected) => {
    const pending = firstValueFrom(source.revokeUserSession(42, 17))
    http
      .expectOne("http://localhost:8080/api/usuarios/42/sesiones/17")
      .flush(
        { detail: "private backend detail" },
        { status: status as number, statusText: "Error" }
      )
    const result = await pending
    expect(!result.success && result.error.code).toBe(expected)
    expect(JSON.stringify(result)).not.toContain("private backend detail")
    http.expectNone("http://localhost:8080/api/usuarios/42/sesiones/17")
  })
  it("cancels dispatched reads when unsubscribed", () => {
    const subscription = source.getUserSessions().subscribe()
    const req = http.expectOne("http://localhost:8080/api/sesiones?pagina=0&tamanio=20")
    subscription.unsubscribe()
    expect(req.cancelled).toBe(true)
  })
})
describe("UserSessionHttpSource environment", () => {
  it.each([
    ["server", "http://localhost:8080"],
    ["browser", null]
  ])("fails closed for %s / %s", async (platform, origin) => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: origin },
        { provide: PLATFORM_ID, useValue: platform }
      ]
    })
    const source = TestBed.inject(UserSessionHttpSource)
    const result = await firstValueFrom(source.getUserSessions())
    expect(!result.success && result.error.code).toBe("UNCONFIGURED")
    TestBed.inject(HttpTestingController).verify()
  })
})
