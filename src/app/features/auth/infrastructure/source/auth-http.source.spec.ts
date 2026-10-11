import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { createEnvironmentInjector, EnvironmentInjector, PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { AuthRepositoryImpl } from "../repositories/auth.repository-impl"
import { AuthPersistentSession } from "../session/auth-persistent-session"
import { AuthHttpSource } from "./auth-http.source"

const origin = "http://localhost:8080"
const endpoint = `${origin}/api/auth/login`
const credentials = { email: "fake@example.test", password: " FakePassword1 " }
const profile = {
  idUsuario: 7,
  nombre: "Fake Name",
  correo: "returned@example.test",
  idRol: 3,
  rol: "Operaciones",
  idioma: "es",
  permisos: ["USUARIO_LEER"]
}
const response = {
  token: "fake-access",
  tipo: "Bearer",
  expiraEnSegundos: 60,
  refreshToken: "fake-refresh",
  refreshExpiraEnSegundos: 600,
  usuario: profile
}

// Deterministic stand-in for the browser's origin-wide exclusive Web Locks queue.
export function fakeLocks(): LockManager {
  let tail = Promise.resolve()
  return {
    request: (_name: string, options: { signal: AbortSignal }, callback: () => Promise<string>) => {
      const pending = tail.then(() => {
        if (options.signal.aborted) throw new Error("Aborted")
        return callback()
      })
      tail = pending.then(
        () => undefined,
        () => undefined
      )
      return pending
    }
  } as unknown as LockManager
}

describe("HTTP auth repository", () => {
  let repository: AuthRepositoryImpl
  let source: AuthHttpSource
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
    source = TestBed.inject(AuthHttpSource)
    storage = TestBed.inject(AuthPersistentSession)
    http = TestBed.inject(HttpTestingController)
    vi.spyOn(storage, "locks", "get").mockReturnValue(fakeLocks())
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

  async function establish(payload: unknown = response) {
    const pending = firstValueFrom(repository.login(credentials))
    const request = http.expectOne(endpoint)
    expect(request.request.method).toBe("POST")
    expect(request.request.body).toEqual({
      correo: credentials.email,
      password: credentials.password
    })
    expect(request.request.headers.has("Authorization")).toBe(false)
    expect(request.request.withCredentials).toBe(false)
    expect(request.request.transferCache).toBe(false)
    request.flush(payload as object)
    return pending
  }

  it("accepts the documented nested login and persists both credentials", async () => {
    expect((await establish()).success).toBe(true)
    expect(storage.read()).toMatchObject({
      token: response.token,
      refreshToken: response.refreshToken
    })
    expect(await firstValueFrom(repository.me())).toMatchObject({
      success: true,
      data: {
        name: profile.nombre,
        email: profile.correo,
        role: profile.rol,
        id: 7,
        roleId: 3,
        language: "es",
        permissions: ["USUARIO_LEER"]
      }
    })
    http.expectNone(`${origin}/api/auth/me`)
  })

  it.each<[unknown, string]>([
    [null, "INVALID_ACCESS"],
    [{}, "INVALID_ACCESS"],
    [{ ...response, token: " " }, "INVALID_ACCESS"],
    [{ ...response, token: "fake\nheader" }, "INVALID_ACCESS"],
    [{ ...response, tipo: "Basic" }, "INVALID_ACCESS"],
    ...[0, -1, "60", 0.5, Number.MAX_SAFE_INTEGER, Infinity, NaN].map(
      seconds => [{ ...response, expiraEnSegundos: seconds }, "INVALID_ACCESS"] as [unknown, string]
    ),
    [{ ...response, refreshToken: null }, "INVALID_REFRESH"],
    [{ ...response, refreshExpiraEnSegundos: 0 }, "INVALID_REFRESH"],
    ...[
      null,
      {},
      { ...profile, nombre: null },
      { ...profile, correo: "invalid" },
      { ...profile, idUsuario: "7" },
      { ...profile, idRol: 0.5 },
      { ...profile, rol: " " },
      { ...profile, idioma: "fr" },
      { ...profile, permisos: null },
      { ...profile, permisos: [123] }
    ].map(usuario => [{ ...response, usuario }, "INVALID_PROFILE"] as [unknown, string])
  ])("rejects malformed access/refresh/profile %j", async (payload, code) => {
    expect(await establish(payload)).toMatchObject({ success: false, error: { code } })
    expect(storage.read()).toBeNull()
    expect((await firstValueFrom(repository.me())).success).toBe(false)
  })

  it.each([
    [401, "INVALID_CREDENTIALS"],
    [403, "FORBIDDEN"],
    [500, "UNEXPECTED"]
  ])("maps HTTP %s safely", async (status, code) => {
    const pending = firstValueFrom(repository.login(credentials))
    http
      .expectOne(endpoint)
      .flush({ sensitive: "not exposed" }, { status: Number(status), statusText: "Failure" })
    expect(await pending).toMatchObject({ success: false, error: { code } })
  })

  it("maps a network failure safely", async () => {
    const pending = firstValueFrom(repository.login(credentials))
    http.expectOne(endpoint).error(new ProgressEvent("error"))
    expect(await pending).toMatchObject({ success: false, error: { code: "NETWORK" } })
  })

  it("restores persisted credentials only through real me, without trusting a stored profile", async () => {
    await establish()
    const saved = storage.raw()!
    TestBed.resetTestingModule()
    localStorage.setItem(storage.key, saved)
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: origin }
      ]
    })
    const restored = firstValueFrom(TestBed.inject(AuthRepositoryImpl).me())
    const controller = TestBed.inject(HttpTestingController)
    const request = controller.expectOne(`${origin}/api/auth/me`)
    expect(request.request.headers.get("Authorization")).toBe(`Bearer ${response.token}`)
    expect(request.request.transferCache).toBe(false)
    request.flush({ ...profile, nombre: "Current backend name", permisos: [] })
    expect(await restored).toMatchObject({
      success: true,
      data: { name: "Current backend name", permissions: [] }
    })
    controller.verify()
  })

  it.each([401, 403, 0, "malformed"])(
    "rejects refused or malformed restored me %s",
    async outcome => {
      await establish()
      const saved = storage.raw()!
      TestBed.resetTestingModule()
      localStorage.setItem(storage.key, saved)
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: API_URL, useValue: origin }
        ]
      })
      const restored = firstValueFrom(TestBed.inject(AuthRepositoryImpl).me())
      const controller = TestBed.inject(HttpTestingController)
      const request = controller.expectOne(`${origin}/api/auth/me`)
      if (outcome === 0) request.error(new ProgressEvent("error"))
      else if (outcome === "malformed") request.flush({ ...profile, permisos: undefined })
      else
        request.flush(
          { sensitive: "not exposed" },
          { status: Number(outcome), statusText: "Failure" }
        )
      expect(await restored).toMatchObject({
        success: false,
        error: {
          code:
            outcome === 401
              ? "INVALID_CREDENTIALS"
              : outcome === 403
                ? "FORBIDDEN"
                : outcome === 0
                  ? "NETWORK"
                  : "INVALID_PROFILE"
        }
      })
      expect(TestBed.inject(AuthPersistentSession).read()).toBeNull()
      controller.verify()
    }
  )

  it("late restored me cannot reestablish identity after logout or a newer login", async () => {
    await establish()
    const saved = storage.raw()!
    TestBed.resetTestingModule()
    localStorage.setItem(storage.key, saved)
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: API_URL, useValue: origin }
      ]
    })
    const repo = TestBed.inject(AuthRepositoryImpl)
    const controller = TestBed.inject(HttpTestingController)
    const restored = firstValueFrom(repo.me())
    const old = controller.expectOne(`${origin}/api/auth/me`)
    repo.logout()
    expect(old.cancelled).toBe(true)
    controller.expectOne(`${origin}/api/auth/logout`).flush(null, { status: 204, statusText: "OK" })
    expect((await restored).success).toBe(false)
    const newer = firstValueFrom(repo.login(credentials))
    controller.expectOne(endpoint).flush({ ...response, usuario: { ...profile, nombre: "Newer" } })
    expect((await newer).success).toBe(true)
    expect(await firstValueFrom(repo.me())).toMatchObject({
      success: true,
      data: { name: "Newer" }
    })
    controller.verify()
  })

  it.each(["corrupt", "expired", "wrong origin", "wrong version"])(
    "rejects %s storage",
    async kind => {
      await establish()
      const envelope = JSON.parse(storage.raw()!)
      if (kind === "expired") {
        envelope.credentials.sessionExpiresAt = Date.now()
        localStorage.setItem(
          `${storage.key}:credentials:${envelope.revision}`,
          JSON.stringify(envelope.credentials)
        )
      }
      if (kind === "wrong origin") envelope.origin = "https://unrelated.test"
      if (kind === "wrong version") envelope.version = 2
      localStorage.setItem(storage.key, kind === "corrupt" ? "{" : JSON.stringify(envelope))
      expect((await firstValueFrom(repository.me())).success).toBe(false)
      expect(storage.read()).toBeNull()
    }
  )

  it("cannot reactivate credentials when another tab invalidates between response check and commit", async () => {
    const original = Storage.prototype.setItem
    const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string
    ) {
      if (key.startsWith(`${storage.key}:credentials:`)) {
        original.call(
          this,
          storage.key,
          JSON.stringify({
            version: 1,
            origin,
            revision: "fake-other-tab-invalidation",
            credentials: null
          })
        )
      }
      original.call(this, key, value)
    })
    expect((await establish()).success).toBe(false)
    write.mockRestore()
    expect(storage.read()).toBeNull()
    expect(JSON.parse(localStorage.getItem(storage.key)!).revision).toBe(
      "fake-other-tab-invalidation"
    )
    expect((await firstValueFrom(repository.me())).success).toBe(false)
  })

  it("fails closed when storage cannot write", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Denied")
    })
    expect(await establish()).toMatchObject({ success: false, error: { code: "STORAGE" } })
    expect((await firstValueFrom(repository.me())).success).toBe(false)
  })

  it("fails closed when storage cannot read", async () => {
    await establish()
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Denied")
    })
    expect((await firstValueFrom(repository.me())).success).toBe(false)
  })

  it("expires at the fixed session deadline rather than access expiry", async () => {
    vi.useFakeTimers()
    await establish({ ...response, expiraEnSegundos: 1, refreshExpiraEnSegundos: 2 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.read()).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1000)
    expect(storage.read()).toBeNull()
    expect((await firstValueFrom(repository.me())).success).toBe(false)
    http.expectNone(`${origin}/api/auth/logout`)
  })

  it("rechecks lifetimes beyond the browser timeout clamp", async () => {
    vi.useFakeTimers()
    await establish({ ...response, expiraEnSegundos: 2147484, refreshExpiraEnSegundos: 2147484 })
    await vi.advanceTimersByTimeAsync(2147483647)
    expect(storage.read()).not.toBeNull()
    await vi.advanceTimersByTimeAsync(353)
    expect(storage.read()).toBeNull()
  })

  it("single-flights refresh and rotation never extends the original session", async () => {
    await establish({ ...response, expiraEnSegundos: 1 })
    const fixed = storage.read()!.sessionExpiresAt
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000)
    const first = firstValueFrom(source.accessToken())
    const second = firstValueFrom(source.accessToken())
    await Promise.resolve()
    const request = http.expectOne(`${origin}/api/auth/refresh`)
    expect(request.request.body).toEqual({ refreshToken: response.refreshToken })
    expect(request.request.headers.has("Authorization")).toBe(false)
    request.flush({
      ...response,
      token: "fake-rotated",
      refreshToken: "fake-rotated-refresh",
      refreshExpiraEnSegundos: 10000
    })
    expect(await first).toBe("fake-rotated")
    expect(await second).toBe("fake-rotated")
    expect(storage.read()!.sessionExpiresAt).toBe(fixed)
    expect(storage.read()!.refreshToken).toBe("fake-rotated-refresh")
  })

  it.each(["unchanged refresh", "malformed profile"])("rejects invalid rotation %s", async kind => {
    await establish({ ...response, expiraEnSegundos: 1 })
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000)
    const pending = firstValueFrom(source.accessToken())
    const assertion = expect(pending).rejects.toMatchObject({
      code: kind === "unchanged refresh" ? "INVALID_REFRESH" : "INVALID_PROFILE"
    })
    await Promise.resolve()
    http
      .expectOne(`${origin}/api/auth/refresh`)
      .flush(
        kind === "unchanged refresh"
          ? response
          : { ...response, refreshToken: "fake-next", usuario: {} }
      )
    await assertion
    expect(storage.read()).toBeNull()
  })

  it("access expiry renews before real me without premature logout", async () => {
    await establish({ ...response, expiraEnSegundos: 1 })
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000)
    const pending = firstValueFrom(repository.me())
    await Promise.resolve()
    http
      .expectOne(`${origin}/api/auth/refresh`)
      .flush({ ...response, token: "fake-next", refreshToken: "fake-next-refresh" })
    const request = await vi.waitFor(() => http.expectOne(`${origin}/api/auth/me`))
    expect(request.request.headers.get("Authorization")).toBe("Bearer fake-next")
    request.flush(profile)
    expect((await pending).success).toBe(true)
    http.expectNone(`${origin}/api/auth/logout`)
  })

  it("rechecks shared storage under the cross-tab lock instead of reusing a rotated token", async () => {
    await establish({ ...response, expiraEnSegundos: 1 })
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000)
    let release!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    vi.spyOn(storage, "locks", "get").mockReturnValue({
      request: async (_name: string, _options: unknown, callback: () => Promise<string>) => {
        await gate
        return callback()
      }
    } as unknown as LockManager)
    const pending = firstValueFrom(source.accessToken())
    const current = storage.read()!
    storage.write(
      {
        ...current,
        token: "fake-other-tab",
        refreshToken: "fake-other-refresh",
        accessExpiresAt: Date.now() + 60000
      },
      storage.raw()
    )
    release()
    expect(await pending).toBe("fake-other-tab")
    http.expectNone(`${origin}/api/auth/refresh`)
  })

  it("serializes two independent tab sources against shared storage", async () => {
    await establish({ ...response, expiraEnSegundos: 1 })
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000)
    const sharedLocks = fakeLocks()
    vi.spyOn(storage, "locks", "get").mockReturnValue(sharedLocks)
    const tab = createEnvironmentInjector(
      [
        { provide: AuthPersistentSession, useClass: AuthPersistentSession },
        { provide: AuthHttpSource, useClass: AuthHttpSource }
      ],
      TestBed.inject(EnvironmentInjector)
    )
    vi.spyOn(tab.get(AuthPersistentSession), "locks", "get").mockReturnValue(sharedLocks)
    try {
      const first = firstValueFrom(source.accessToken())
      const second = firstValueFrom(tab.get(AuthHttpSource).accessToken())
      await Promise.resolve()
      const request = http.expectOne(`${origin}/api/auth/refresh`)
      request.flush({ ...response, token: "fake-shared", refreshToken: "fake-shared-refresh" })
      expect(await first).toBe("fake-shared")
      expect(await second).toBe("fake-shared")
      http.expectNone(`${origin}/api/auth/refresh`)
    } finally {
      tab.destroy()
    }
  })

  it("fails closed without Web Locks rather than refreshing in parallel", async () => {
    await establish({ ...response, expiraEnSegundos: 1 })
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000)
    vi.spyOn(storage, "locks", "get").mockReturnValue(null)
    await expect(firstValueFrom(source.accessToken())).rejects.toMatchObject({
      code: "COORDINATION"
    })
    expect(storage.read()).toBeNull()
  })

  it.each([401, 403, 0])("invalidates ambiguous or refused refresh %s", async status => {
    await establish({ ...response, expiraEnSegundos: 1 })
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000)
    const pending = firstValueFrom(source.accessToken())
    const assertion = expect(pending).rejects.toBeInstanceOf(Error)
    await Promise.resolve()
    const request = http.expectOne(`${origin}/api/auth/refresh`)
    if (status === 0) request.error(new ProgressEvent("error"))
    else request.flush(null, { status, statusText: "Failure" })
    await assertion
    expect(storage.read()).toBeNull()
  })

  it("cancels refresh on last unsubscription without reusing its one-time token", async () => {
    await establish({ ...response, expiraEnSegundos: 1 })
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000)
    const subscription = source.accessToken().subscribe()
    await Promise.resolve()
    const request = http.expectOne(`${origin}/api/auth/refresh`)
    subscription.unsubscribe()
    expect(request.cancelled).toBe(true)
    expect(storage.read()).toBeNull()
    await Promise.resolve()
  })

  it("logout cancels in-flight refresh and cannot resurrect credentials", async () => {
    await establish({ ...response, expiraEnSegundos: 1 })
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000)
    const pending = firstValueFrom(source.accessToken())
    const assertion = expect(pending).rejects.toBeInstanceOf(Error)
    await Promise.resolve()
    const request = http.expectOne(`${origin}/api/auth/refresh`)
    repository.logout()
    expect(request.cancelled).toBe(true)
    http.expectOne(`${origin}/api/auth/logout`).flush(null, { status: 204, statusText: "OK" })
    await assertion
    expect(storage.read()).toBeNull()
  })

  it("bounds offline logout and cancels revocation on root destruction", async () => {
    vi.useFakeTimers()
    await establish()
    repository.logout()
    const offline = http.expectOne(`${origin}/api/auth/logout`)
    await vi.advanceTimersByTimeAsync(10000)
    expect(offline.cancelled).toBe(true)
    await establish()
    repository.logout()
    const pending = http.expectOne(`${origin}/api/auth/logout`)
    TestBed.resetTestingModule()
    expect(pending.cancelled).toBe(true)
  })

  it.each([200, 204, 0])(
    "clears logout immediately and tolerates remote outcome %s",
    async status => {
      await establish()
      repository.logout()
      expect(storage.read()).toBeNull()
      expect((await firstValueFrom(repository.me())).success).toBe(false)
      const request = http.expectOne(`${origin}/api/auth/logout`)
      expect(request.request.body).toEqual({ refreshToken: response.refreshToken })
      expect(request.request.headers.get("Authorization")).toBe(`Bearer ${response.token}`)
      if (status === 0) request.error(new ProgressEvent("error"))
      else request.flush(null, { status, statusText: "OK" })
    }
  )

  it("cancels pending login on logout", async () => {
    const pending = firstValueFrom(repository.login(credentials))
    const request = http.expectOne(endpoint)
    repository.logout()
    expect(request.cancelled).toBe(true)
    expect((await pending).success).toBe(false)
    expect(storage.read()).toBeNull()
  })

  it("unsubscription cannot establish a session", async () => {
    const subscription = repository.login(credentials).subscribe()
    const request = http.expectOne(endpoint)
    subscription.unsubscribe()
    expect(request.cancelled).toBe(true)
    expect(storage.read()).toBeNull()
  })

  it("newer login cancels an older request without remote revocation", async () => {
    const old = firstValueFrom(repository.login(credentials))
    const request = http.expectOne(endpoint)
    const newer = firstValueFrom(repository.login(credentials))
    expect(request.cancelled).toBe(true)
    http.expectOne(endpoint).flush(response)
    expect((await old).success).toBe(false)
    expect((await newer).success).toBe(true)
    http.expectNone(`${origin}/api/auth/logout`)
  })

  it("revalidates external credential changes through real me and preserves unchanged loaded state", async () => {
    await establish()
    window.dispatchEvent(new StorageEvent("storage", { key: storage.key }))
    http.expectNone(`${origin}/api/auth/me`)
    const current = storage.read()!
    storage.write({ ...current, token: "fake-other-tab" }, storage.raw())
    const changes = vi.fn()
    source.sessionChanges().subscribe(changes)
    window.dispatchEvent(new StorageEvent("storage", { key: storage.key }))
    expect(changes).toHaveBeenLastCalledWith(null)
    const request = http.expectOne(`${origin}/api/auth/me`)
    expect(request.request.headers.get("Authorization")).toBe("Bearer fake-other-tab")
    request.flush({ ...profile, permisos: [] })
    expect(changes).toHaveBeenLastCalledWith(expect.objectContaining({ permissions: [] }))
  })

  it("storage invalidation cancels pending login and emits anonymous identity", async () => {
    const changes = vi.fn()
    source.sessionChanges().subscribe(changes)
    const pending = firstValueFrom(repository.login(credentials))
    const request = http.expectOne(endpoint)
    localStorage.removeItem(storage.key)
    window.dispatchEvent(new StorageEvent("storage", { key: storage.key }))
    expect(request.cancelled).toBe(true)
    expect((await pending).success).toBe(false)
    expect(changes).toHaveBeenLastCalledWith(null)
  })

  it.each([
    null,
    "",
    "ftp://example.test",
    "https://user:password@example.test",
    "http://other.example.test",
    "http://localhost:9999",
    "https://example.test/path",
    "https://example.test?query=1",
    "https://example.test#fragment"
  ])("fails closed for API base %s", async base => {
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

  it("cannot read storage, authenticate or restore on the server", async () => {
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
    expect((await firstValueFrom(server.login(credentials))).success).toBe(false)
    expect((await firstValueFrom(server.me())).success).toBe(false)
    server.logout()
    expect(read).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    TestBed.inject(HttpTestingController).expectNone(() => true)
  })
})
