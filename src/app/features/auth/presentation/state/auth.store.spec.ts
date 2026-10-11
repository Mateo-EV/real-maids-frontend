import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { LoginUseCase } from "@/app/features/auth/application/use-cases/login.use-case"
import { LogoutUseCase } from "@/app/features/auth/application/use-cases/logout.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, Subject } from "rxjs"
import { GetCurrentUserUseCase } from "../../application/use-cases/get-current-user.use-case"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "./auth.store"

describe("AuthStore", () => {
  const login = vi.fn()
  const logout = vi.fn()
  const me = vi.fn()
  let store: InstanceType<typeof AuthStore>

  beforeEach(() => {
    login.mockReset()
    logout.mockReset()
    me.mockReset()

    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        { provide: LoginUseCase, useValue: { execute: login } },
        { provide: LogoutUseCase, useValue: { execute: logout } },
        { provide: GetCurrentUserUseCase, useValue: { execute: me } }
      ]
    })

    store = TestBed.inject(AuthStore)
  })

  it("restores a delayed session and completes after the first result", async () => {
    const response = new Subject<Result<AuthSession, AuthError>>()
    const session = AuthSession.create("Demo", "demo@example.com")
    me.mockReturnValue(response)
    const restored = firstValueFrom(store.restoreSession())
    expect(store.session()).toBeNull()
    response.next(Result.success(session))
    expect(await restored).toBe(session)
    expect(store.session()).toBe(session)
    expect(response.observed).toBe(false)
  })

  it.each(["failure", "observable error", "empty"])(
    "remains anonymous on restoration %s",
    async outcome => {
      const response = new Subject<Result<AuthSession, AuthError>>()
      me.mockReturnValue(response)
      const restored = firstValueFrom(store.restoreSession())
      if (outcome === "failure") response.next(Result.failure(new AuthError("UNEXPECTED")))
      else if (outcome === "empty") response.complete()
      else response.error(new Error("offline"))
      expect(await restored).toBeNull()
      expect(store.isAuthenticated()).toBe(false)
    }
  )

  it("does not restore a pending successful session after logout", async () => {
    const response = new Subject<Result<AuthSession, AuthError>>()
    me.mockReturnValue(response)
    const restored = firstValueFrom(store.restoreSession())
    expect(response.observed).toBe(true)
    store.logout()
    response.next(Result.success(AuthSession.create("Old", "old@example.com")))
    expect(await restored).toBeNull()
    expect(store.session()).toBeNull()
    expect(store.isAuthenticated()).toBe(false)
    expect(logout).toHaveBeenCalledOnce()
  })

  it.each(["success", "failure", "error", "empty"])(
    "preserves a newer login over a pending restoration %s",
    async outcome => {
      const response = new Subject<Result<AuthSession, AuthError>>()
      me.mockReturnValue(response)
      const restored = firstValueFrom(store.restoreSession())
      const newer = AuthSession.create("New", "new@example.com")
      login.mockReturnValue(of(Result.success(newer)))
      store.login({ email: newer.email, password: "demo2026" }).subscribe()
      if (outcome === "success")
        response.next(Result.success(AuthSession.create("Old", "old@example.com")))
      else if (outcome === "failure") response.next(Result.failure(new AuthError("UNEXPECTED")))
      else if (outcome === "empty") response.complete()
      else response.error(new Error("offline"))
      expect(await restored).toBe(newer)
      expect(store.session()).toBe(newer)
      expect(store.isAuthenticated()).toBe(true)
    }
  )

  it("fails closed when the use case throws before returning an observable", async () => {
    me.mockImplementation(() => {
      throw new Error("offline")
    })
    expect(await firstValueFrom(store.restoreSession())).toBeNull()
    expect(store.isAuthenticated()).toBe(false)
  })

  it("preserves an already loaded session without another repository request", async () => {
    const session = AuthSession.create("Demo", "demo@example.com")
    login.mockReturnValue(of(Result.success(session)))
    store.login({ email: session.email, password: "demo2026" }).subscribe()
    expect(await firstValueFrom(store.restoreSession())).toBe(session)
    expect(me).not.toHaveBeenCalled()
    store.logout()
    me.mockReturnValue(of(Result.failure(new AuthError("UNEXPECTED"))))
    expect(await firstValueFrom(store.restoreSession())).toBeNull()
    expect(me).toHaveBeenCalledOnce()
  })

  it("does not accept a late login completion after logout", async () => {
    const response = new Subject<Result<AuthSession, AuthError>>()
    login.mockReturnValue(response)
    const pending = firstValueFrom(
      store.login({ email: "fake@example.test", password: "FakePassword1" })
    )
    store.logout()
    response.next(Result.success(AuthSession.create("Old", "fake@example.test")))
    expect((await pending).success).toBe(false)
    expect(store.session()).toBeNull()
  })

  it("clears loaded identity at expiry without keeping a stale guard snapshot", async () => {
    vi.useFakeTimers()
    try {
      const session = Object.assign(AuthSession.create("Demo", "fake@example.test"), {
        expiresAt: Date.now() + 1000
      })
      login.mockReturnValue(of(Result.success(session)))
      me.mockReturnValue(of(Result.failure(new AuthError("UNEXPECTED"))))
      store.login({ email: session.email, password: "FakePassword1" }).subscribe()
      await vi.advanceTimersByTimeAsync(1000)
      expect(store.session()).toBeNull()
      expect(store.isAuthenticated()).toBe(false)
      expect(await firstValueFrom(store.restoreSession())).toBeNull()
      expect(logout).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it("starts without an authenticated session", () => {
    expect(store.session()).toBeNull()
    expect(store.isAuthenticated()).toBe(false)
  })

  it("stores the session after a successful login", () => {
    const session = AuthSession.create("Administrador Demo", "admin@realmaids.com")
    login.mockReturnValue(of(Result.success(session)))

    store.login({ email: session.email, password: "demo2026" }).subscribe()

    expect(store.session()).toBe(session)
    expect(store.isAuthenticated()).toBe(true)
  })

  it("keeps the anonymous state when login fails", () => {
    const error = new AuthError("INVALID_CREDENTIALS")
    login.mockReturnValue(of(Result.failure(error)))

    store.login({ email: "wrong@realmaids.com", password: "incorrecta" }).subscribe()

    expect(store.session()).toBeNull()
    expect(store.isAuthenticated()).toBe(false)
  })

  it("delegates logout and clears the session", () => {
    const session = AuthSession.create("Administrador Demo", "admin@realmaids.com")
    login.mockReturnValue(of(Result.success(session)))
    store.login({ email: session.email, password: "demo2026" }).subscribe()

    store.logout()

    expect(logout).toHaveBeenCalledOnce()
    expect(store.session()).toBeNull()
    expect(store.isAuthenticated()).toBe(false)
  })
})
