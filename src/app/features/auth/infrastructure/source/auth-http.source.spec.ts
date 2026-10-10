import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { AuthRepositoryImpl } from "../repositories/auth.repository-impl"

const endpoint = "http://localhost:8080/api/auth/login"
const credentials = { email: "fake@example.test", password: " FakePassword1 " }
const response = {
  token: "fake-token",
  tipo: "Bearer",
  expiraEnSegundos: 60,
  correo: "returned@example.test",
  rol: "Operaciones"
}

describe("HTTP auth repository", () => {
  let repository: AuthRepositoryImpl
  let http: HttpTestingController
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" }
      ]
    })
    repository = TestBed.inject(AuthRepositoryImpl)
    http = TestBed.inject(HttpTestingController)
  })
  afterEach(() => {
    http.verify()
    vi.useRealTimers()
  })

  async function establish(payload: object | null = response) {
    const pending = firstValueFrom(repository.login(credentials))
    const request = http.expectOne(endpoint)
    expect(request.request.method).toBe("POST")
    expect(request.request.body).toEqual({
      correo: credentials.email,
      password: credentials.password
    })
    expect(request.request.headers.has("Authorization")).toBe(false)
    expect(request.request.withCredentials).toBe(false)
    request.flush(payload)
    return pending
  }

  it("maps only returned identity, preserving password bytes and using local me", async () => {
    expect((await establish()).success).toBe(true)
    const current = await firstValueFrom(repository.me())
    expect(current).toMatchObject({
      success: true,
      data: { name: null, email: response.correo, role: response.rol }
    })
    http.expectNone("http://localhost:8080/api/auth/me")
    repository.logout()
    expect((await firstValueFrom(repository.me())).success).toBe(false)
    http.expectNone("http://localhost:8080/api/auth/logout")
  })

  it.each([
    null,
    {},
    { ...response, token: " " },
    { ...response, tipo: "Basic" },
    { ...response, correo: "invalid" },
    { ...response, rol: " " },
    { ...response, expiraEnSegundos: 0 },
    { ...response, expiraEnSegundos: -1 },
    { ...response, expiraEnSegundos: "60" },
    { ...response, expiraEnSegundos: 0.5 },
    { ...response, expiraEnSegundos: Number.MAX_SAFE_INTEGER },
    { ...response, expiraEnSegundos: Infinity },
    { ...response, expiraEnSegundos: NaN },
    { ...response, tipo: null },
    { ...response, token: 123 },
    { ...response, correo: null },
    { ...response, rol: null }
  ])("rejects malformed responses without retaining credentials: %j", async payload => {
    expect(await establish(payload)).toMatchObject({
      success: false,
      error: { code: "INVALID_RESPONSE" }
    })
    expect((await firstValueFrom(repository.me())).success).toBe(false)
  })

  it.each([
    [401, "INVALID_CREDENTIALS"],
    [403, "UNEXPECTED"],
    [500, "UNEXPECTED"]
  ])("maps HTTP %s safely", async (status, code) => {
    const pending = firstValueFrom(repository.login(credentials))
    http
      .expectOne(endpoint)
      .flush({ sensitive: "must not propagate" }, { status: Number(status), statusText: "Failure" })
    expect(await pending).toMatchObject({ success: false, error: { code } })
    expect((await firstValueFrom(repository.me())).success).toBe(false)
  })

  it("maps a network failure safely", async () => {
    const pending = firstValueFrom(repository.login(credentials))
    http.expectOne(endpoint).error(new ProgressEvent("error"))
    expect(await pending).toMatchObject({ success: false, error: { code: "NETWORK" } })
  })

  it("expires exactly at the local deadline", async () => {
    vi.useFakeTimers()
    await establish({ ...response, expiraEnSegundos: 1 })
    expect((await firstValueFrom(repository.me())).success).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    expect((await firstValueFrom(repository.me())).success).toBe(false)
  })

  it("handles lifetimes beyond the browser timeout limit without expiring early", async () => {
    vi.useFakeTimers()
    await establish({ ...response, expiraEnSegundos: 2147484 })
    await vi.advanceTimersByTimeAsync(2147483647)
    expect((await firstValueFrom(repository.me())).success).toBe(true)
    await vi.advanceTimersByTimeAsync(353)
    expect((await firstValueFrom(repository.me())).success).toBe(false)
  })

  it("a failed replacement login clears the previous identity", async () => {
    await establish()
    await establish({ ...response, token: "" })
    expect((await firstValueFrom(repository.me())).success).toBe(false)
  })

  it("does not restore a persistent demo flag", async () => {
    const read = vi.spyOn(Storage.prototype, "getItem")
    const write = vi.spyOn(Storage.prototype, "setItem")
    try {
      expect((await firstValueFrom(repository.me())).success).toBe(false)
      await establish()
      repository.logout()
      expect(read).not.toHaveBeenCalled()
      expect(write).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
      write.mockRestore()
    }
  })

  it("cancels pending login on logout", async () => {
    const pending = firstValueFrom(repository.login(credentials))
    const request = http.expectOne(endpoint)
    repository.logout()
    expect(request.cancelled).toBe(true)
    expect((await pending).success).toBe(false)
    expect((await firstValueFrom(repository.me())).success).toBe(false)
  })

  it("unsubscription cannot establish a session", async () => {
    const subscription = repository.login(credentials).subscribe()
    const request = http.expectOne(endpoint)
    subscription.unsubscribe()
    expect(request.cancelled).toBe(true)
    expect((await firstValueFrom(repository.me())).success).toBe(false)
  })

  it("newer login cancels an older request", async () => {
    const old = firstValueFrom(repository.login(credentials))
    const request = http.expectOne(endpoint)
    const newer = firstValueFrom(repository.login(credentials))
    expect(request.cancelled).toBe(true)
    http.expectOne(endpoint).flush(response)
    expect((await old).success).toBe(false)
    expect((await newer).success).toBe(true)
  })

  it.each([
    null,
    "",
    "ftp://example.test",
    "https://user:password@example.test",
    "http://other.example.test",
    "https://example.test/path",
    "https://example.test?query=1",
    "https://example.test#fragment"
  ])("fails closed for unusable API base %s", async base => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: base }
      ]
    })
    expect(
      await firstValueFrom(TestBed.inject(AuthRepositoryImpl).login(credentials))
    ).toMatchObject({ success: false, error: { code: "UNCONFIGURED" } })
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })

  it("cannot authenticate on the server", async () => {
    TestBed.resetTestingModule()
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: "http://localhost:8080" },
        { provide: PLATFORM_ID, useValue: "server" }
      ]
    })
    const server = TestBed.inject(AuthRepositoryImpl)
    expect((await firstValueFrom(server.login(credentials))).success).toBe(false)
    expect((await firstValueFrom(server.me())).success).toBe(false)
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
