import { DOCUMENT } from "@angular/common"
import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthInMemorySource } from "./auth-in-memory.source"

const demoCredentials = { email: "riojamatthew@gmail.com", password: "demo2026" }

describe("AuthInMemorySource", () => {
  beforeEach(() => {
    localStorage.clear()
    TestBed.configureTestingModule({ providers: [{ provide: PLATFORM_ID, useValue: "browser" }] })
  })

  it("restores a browser flag in a fresh source", async () => {
    localStorage.setItem("authenticated", "true")
    expect((await firstValueFrom(TestBed.inject(AuthInMemorySource).me())).success).toBe(true)
  })

  it.each([null, "false", "invalid"])("rejects an absent or invalid flag: %s", async flag => {
    if (flag !== null) localStorage.setItem("authenticated", flag)
    expect((await firstValueFrom(TestBed.inject(AuthInMemorySource).me())).success).toBe(false)
  })

  it("never reads browser storage or authenticates on the server", async () => {
    localStorage.setItem("authenticated", "true")
    TestBed.overrideProvider(PLATFORM_ID, { useValue: "server" })
    const read = vi.spyOn(Storage.prototype, "getItem")
    try {
      const source = TestBed.inject(AuthInMemorySource)
      expect((await firstValueFrom(source.me())).success).toBe(false)
      expect((await firstValueFrom(source.login(demoCredentials))).success).toBe(false)
      source.logout()
      expect(read).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
    expect(localStorage.getItem("authenticated")).toBe("true")
  })

  it("fails closed when accessing storage throws", async () => {
    TestBed.overrideProvider(DOCUMENT, { useValue: {
      defaultView: { get localStorage(): Storage { throw new Error("unavailable") } }
    } })
    const source = TestBed.inject(AuthInMemorySource)
    expect((await firstValueFrom(source.me())).success).toBe(false)
    expect((await firstValueFrom(source.login(demoCredentials))).success).toBe(false)
    expect(() => source.logout()).not.toThrow()
  })

  it("fails closed when storage operations throw", async () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error("read") }),
      setItem: vi.fn(() => { throw new Error("write") })
    }
    TestBed.overrideProvider(DOCUMENT, { useValue: { defaultView: { localStorage: storage } } })
    const source = TestBed.inject(AuthInMemorySource)
    expect((await firstValueFrom(source.me())).success).toBe(false)
    expect((await firstValueFrom(source.login(demoCredentials))).success).toBe(false)
    expect(() => source.logout()).not.toThrow()
  })

  it("fails closed without a browser window", async () => {
    TestBed.overrideProvider(DOCUMENT, { useValue: { defaultView: null } })
    expect((await firstValueFrom(TestBed.inject(AuthInMemorySource).me())).success).toBe(false)
  })

  it("creates a session for the demo credentials", async () => {
    const source = TestBed.inject(AuthInMemorySource)
    const loginResult = await firstValueFrom(source.login(demoCredentials))
    const sessionResult = await firstValueFrom(source.me())
    expect(loginResult.success).toBe(true)
    expect(sessionResult.success).toBe(true)
    if (sessionResult.success) {
      expect(sessionResult.data.email).toBe(demoCredentials.email)
      expect(sessionResult.data.name).toBe("Mateo")
    }
  })

  it("rejects invalid credentials and clears the flag", async () => {
    localStorage.setItem("authenticated", "true")
    const source = TestBed.inject(AuthInMemorySource)
    const result = await firstValueFrom(
      source.login({ email: "unknown@realmaids.com", password: "incorrecta" })
    )
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe("INVALID_CREDENTIALS")
    expect(localStorage.getItem("authenticated")).toBe("false")
  })

  it("removes the active session on logout", async () => {
    const source = TestBed.inject(AuthInMemorySource)
    await firstValueFrom(source.login(demoCredentials))
    source.logout()
    expect(localStorage.getItem("authenticated")).toBe("false")
    expect((await firstValueFrom(source.me())).success).toBe(false)
  })
})
