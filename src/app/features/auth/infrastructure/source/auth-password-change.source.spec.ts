import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { AuthRepositoryImpl } from "../repositories/auth.repository-impl"
import { AuthPersistentSession } from "../session/auth-persistent-session"
import { AuthHttpSource } from "./auth-http.source"

const origin = "http://localhost:8080"
const passwordEndpoint = `${origin}/api/auth/me/password`
const meEndpoint = `${origin}/api/auth/me`
const profile = {
  idUsuario: 12,
  nombre: "Cliente Portal",
  correo: "cliente@example.test",
  idRol: 4,
  rol: "Cliente",
  idioma: "es",
  permisos: [],
  debeCambiarPassword: true
}
const loginResponse = {
  token: "fake-access",
  tipo: "Bearer",
  expiraEnSegundos: 60,
  refreshToken: "fake-refresh",
  refreshExpiraEnSegundos: 600,
  usuario: profile
}
const passwords = { currentPassword: " Provisional1 ", newPassword: " Definitiva2 " }

describe("HTTP password change", () => {
  let repository: AuthRepositoryImpl
  let storage: AuthPersistentSession
  let http: HttpTestingController

  beforeEach(() => {
    localStorage.clear()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: origin }
      ]
    })
    repository = TestBed.inject(AuthRepositoryImpl)
    storage = TestBed.inject(AuthPersistentSession)
    http = TestBed.inject(HttpTestingController)
  })

  afterEach(() => {
    try {
      http.verify()
    } finally {
      TestBed.resetTestingModule()
      vi.useRealTimers()
      vi.restoreAllMocks()
      localStorage.clear()
    }
  })

  async function establish(payload: unknown = loginResponse) {
    const pending = firstValueFrom(
      repository.login({ email: profile.correo, password: "Provisional1" })
    )
    http.expectOne(`${origin}/api/auth/login`).flush(payload as object)
    expect((await pending).success).toBe(true)
    // The profile that produced the session is the published snapshot from the login response.
    http.expectNone(meEndpoint)
  }

  it("sends the documented body with credential bytes untouched", async () => {
    await establish()
    const pending = firstValueFrom(repository.changePassword(passwords))
    const request = http.expectOne(passwordEndpoint)
    expect(request.request.method).toBe("PUT")
    expect(request.request.body).toEqual({
      passwordActual: passwords.currentPassword,
      passwordNueva: passwords.newPassword
    })
    expect(request.request.headers.get("Authorization")).toBe(`Bearer ${loginResponse.token}`)
    expect(request.request.transferCache).toBe(false)
    expect(request.request.withCredentials).toBe(false)
    request.flush(null, { status: 204, statusText: "No Content" })
    expect(await pending).toMatchObject({ success: true })
    expect(storage.read()).toMatchObject({ token: loginResponse.token })

    const reread = firstValueFrom(repository.me(true))
    const meRequest = http.expectOne(meEndpoint)
    expect(meRequest.request.method).toBe("GET")
    meRequest.flush({ ...profile, debeCambiarPassword: false })
    expect(await reread).toMatchObject({
      success: true,
      data: { mustChangePassword: false }
    })
  })

  it.each([
    [400, "INVALID_PASSWORD_CHANGE"],
    [401, "INVALID_CREDENTIALS"],
    [403, "FORBIDDEN"],
    [500, "UNEXPECTED"]
  ])("maps a rejected change HTTP %s without dropping the session", async (status, code) => {
    await establish()
    const pending = firstValueFrom(repository.changePassword(passwords))
    http
      .expectOne(passwordEndpoint)
      .flush(
        { mensaje: "raw backend copy never shown" },
        { status: Number(status), statusText: "Failure" }
      )
    const result = await pending
    expect(result).toMatchObject({ success: false, error: { code } })
    expect(JSON.stringify(result)).not.toContain("raw backend copy")
    // A rejected change keeps the session: the flag stays set and the person can retry or leave.
    expect(storage.read()).toMatchObject({ token: loginResponse.token })
  })

  it("maps a network failure safely", async () => {
    await establish()
    const pending = firstValueFrom(repository.changePassword(passwords))
    http.expectOne(passwordEndpoint).error(new ProgressEvent("error"))
    expect(await pending).toMatchObject({ success: false, error: { code: "NETWORK" } })
  })

  it("serves the published profile until a forced read is requested", async () => {
    await establish()
    const cached = await firstValueFrom(repository.me())
    expect(cached).toMatchObject({ success: true, data: { mustChangePassword: true } })
    http.expectNone(meEndpoint)

    const forced = firstValueFrom(repository.me(true))
    http.expectOne(meEndpoint).flush({ ...profile, debeCambiarPassword: false })
    expect(await forced).toMatchObject({ success: true, data: { mustChangePassword: false } })
    // The refreshed profile is now the published snapshot.
    expect(await firstValueFrom(repository.me())).toMatchObject({
      success: true,
      data: { mustChangePassword: false }
    })
  })

  it("fails closed without dispatching when the session is gone", async () => {
    await establish()
    repository.invalidate()
    const pending = firstValueFrom(repository.changePassword(passwords))
    expect(await pending).toMatchObject({ success: false, error: { code: "INVALID_CREDENTIALS" } })
    http.expectNone(passwordEndpoint)
  })

  it("does not read stored credentials or dispatch HTTP while rendering on the server", async () => {
    TestBed.resetTestingModule()
    const read = vi.spyOn(Storage.prototype, "getItem")
    const write = vi.spyOn(Storage.prototype, "setItem")
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: origin },
        { provide: PLATFORM_ID, useValue: "server" }
      ]
    })
    const server = TestBed.inject(AuthRepositoryImpl)
    expect(await firstValueFrom(server.changePassword(passwords))).toMatchObject({
      success: false,
      error: { code: "UNCONFIGURED" }
    })
    expect(await firstValueFrom(server.me(true))).toMatchObject({ success: false })
    TestBed.inject(HttpTestingController).expectNone(() => true)
    expect(read).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it("never dispatches when the API origin is not configured", async () => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "" }
      ]
    })
    const unconfigured = TestBed.inject(AuthRepositoryImpl)
    expect(await firstValueFrom(unconfigured.changePassword(passwords))).toMatchObject({
      success: false,
      error: { code: "UNCONFIGURED" }
    })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })

  it("cancels a pending change when the session is replaced", async () => {
    await establish()
    const source = TestBed.inject(AuthHttpSource)
    const pending = firstValueFrom(repository.changePassword(passwords))
    http.expectOne(passwordEndpoint)
    source.invalidate()
    // The in-flight request is unsubscribed, so it can no longer confirm the change.
    expect(await pending).toMatchObject({ success: false, error: { code: "CANCELLED" } })
    expect(storage.read()).toBeNull()
  })
})
