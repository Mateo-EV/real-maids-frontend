import { apiConflictContext } from "@/app/core/http/api-conflict-context"
import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors
} from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { AuthHttpSource } from "../source/auth-http.source"
import { authInterceptor } from "./auth.interceptor"

const origin = "http://localhost:8080"
const profile = {
  idUsuario: 7,
  nombre: "Fake Name",
  correo: "fake@example.test",
  idRol: 3,
  rol: "Operaciones",
  idioma: "es",
  permisos: []
}

describe("origin-scoped auth interceptor", () => {
  let http: HttpTestingController
  let client: HttpClient
  let source: AuthHttpSource
  beforeEach(async () => {
    localStorage.clear()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: origin }
      ]
    })
    http = TestBed.inject(HttpTestingController)
    client = TestBed.inject(HttpClient)
    source = TestBed.inject(AuthHttpSource)
    await establish("fake-first")
  })
  afterEach(() => {
    http.verify()
    localStorage.clear()
  })

  async function establish(token: string) {
    const pending = firstValueFrom(
      source.login({ email: "fake@example.test", password: "FakePassword1" })
    )
    http.expectOne(`${origin}/api/auth/login`).flush({
      token,
      tipo: "Bearer",
      expiraEnSegundos: 60,
      refreshToken: `fake-refresh-${token}`,
      refreshExpiraEnSegundos: 600,
      usuario: profile
    })
    expect((await pending).success).toBe(true)
  }

  it("attaches to configured API paths and disables credential transfer caching", async () => {
    const pending = firstValueFrom(client.get(`${origin}/api/usuarios`))
    const request = http.expectOne(`${origin}/api/usuarios`)
    expect(request.request.headers.get("Authorization")).toBe("Bearer fake-first")
    expect(request.request.transferCache).toBe(false)
    expect(request.request.withCredentials).toBe(false)
    request.flush([])
    await pending
  })

  it.each([
    "https://unrelated.test/api/usuarios",
    `${origin}/assets/file`,
    `${origin}/apix/usuarios`,
    "http://user:password@localhost:8080/api/usuarios",
    "/api/usuarios",
    `${origin}/api/auth/login`,
    `${origin}/api/auth/refresh`,
    `${origin}/api/auth/logout`
  ])("does not attach to unrelated or public URL %s", async url => {
    const pending = firstValueFrom(client.post(url, {}))
    const request = http.expectOne(url)
    expect(request.request.headers.has("Authorization")).toBe(false)
    request.flush({})
    await pending
  })

  it("never replays a mutation on 401 and invalidates the matching session", async () => {
    const pending = firstValueFrom(client.post(`${origin}/api/usuarios`, {}))
    const assertion = expect(pending).rejects.toBeInstanceOf(Error)
    http
      .expectOne(`${origin}/api/usuarios`)
      .flush({ sensitive: "not exposed" }, { status: 401, statusText: "Unauthorized" })
    await assertion
    expect((await firstValueFrom(source.me())).success).toBe(false)
    http.expectNone(`${origin}/api/usuarios`)
    http.expectNone(`${origin}/api/auth/refresh`)
    http.expectNone(`${origin}/api/auth/logout`)
  })

  it("delivers an opted-in conflict once without clearing credentials or replaying the write", async () => {
    const pending = firstValueFrom(
      client.post(`${origin}/api/clientes`, {}, { context: apiConflictContext() })
    )
    const assertion = expect(pending).rejects.toBeInstanceOf(HttpErrorResponse)
    const request = http.expectOne(`${origin}/api/clientes`)
    expect(request.request.headers.get("Authorization")).toBe("Bearer fake-first")
    request.flush(
      { errores: { correo: "EMAIL_RESERVED" } },
      { status: 409, statusText: "Conflict" }
    )
    await assertion
    expect((await firstValueFrom(source.me())).success).toBe(true)
    http.expectNone(`${origin}/api/clientes`)
    http.expectNone(`${origin}/api/auth/refresh`)
  })

  it("preserves existing generic conflict behavior without opt-in", async () => {
    const pending = firstValueFrom(client.post(`${origin}/api/usuarios`, {}))
    const assertion = expect(pending).rejects.toMatchObject({ code: "UNEXPECTED" })
    http.expectOne(`${origin}/api/usuarios`).flush({}, { status: 409, statusText: "Conflict" })
    await assertion
    expect((await firstValueFrom(source.me())).success).toBe(true)
  })

  it("still invalidates an opted-in request on 401 without replay", async () => {
    const pending = firstValueFrom(
      client.post(`${origin}/api/clientes`, {}, { context: apiConflictContext() })
    )
    const assertion = expect(pending).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" })
    http.expectOne(`${origin}/api/clientes`).flush({}, { status: 401, statusText: "Unauthorized" })
    await assertion
    expect((await firstValueFrom(source.me())).success).toBe(false)
    http.expectNone(`${origin}/api/clientes`)
  })

  it("ignores a stale 401 after a newer login", async () => {
    const pending = firstValueFrom(client.get(`${origin}/api/usuarios`))
    const assertion = expect(pending).rejects.toBeInstanceOf(Error)
    const stale = http.expectOne(`${origin}/api/usuarios`)
    await establish("fake-newer")
    stale.flush(null, { status: 401, statusText: "Unauthorized" })
    await assertion
    expect((await firstValueFrom(source.me())).success).toBe(true)
  })

  it.each([403, 0])("does not erase a valid identity on protected error %s", async status => {
    const pending = firstValueFrom(client.get(`${origin}/api/usuarios`))
    const assertion = expect(pending).rejects.toBeInstanceOf(Error)
    const request = http.expectOne(`${origin}/api/usuarios`)
    if (status === 0) request.error(new ProgressEvent("error"))
    else request.flush(null, { status, statusText: "Forbidden" })
    await assertion
    expect((await firstValueFrom(source.me())).success).toBe(true)
  })
})
