import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { LoginUseCase } from "@/app/features/auth/application/use-cases/login.use-case"
import { LogoutUseCase } from "@/app/features/auth/application/use-cases/logout.use-case"
import { UserSession } from "@/app/features/auth/domain/entities/user-session.entity"
import { Result } from "@/app/shared/utils/result"
import { TestBed } from "@angular/core/testing"
import { of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "./auth.store"

describe("AuthStore", () => {
  const login = vi.fn()
  const logout = vi.fn()
  let store: InstanceType<typeof AuthStore>

  beforeEach(() => {
    login.mockReset()
    logout.mockReset()

    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        { provide: LoginUseCase, useValue: { execute: login } },
        { provide: LogoutUseCase, useValue: { execute: logout } }
      ]
    })

    store = TestBed.inject(AuthStore)
  })

  it("starts without an authenticated session", () => {
    expect(store.session()).toBeNull()
    expect(store.isAuthenticated()).toBe(false)
  })

  it("stores the session after a successful login", () => {
    const session = UserSession.create("Administrador Demo", "admin@realmaids.com")
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
    const session = UserSession.create("Administrador Demo", "admin@realmaids.com")
    login.mockReturnValue(of(Result.success(session)))
    store.login({ email: session.email, password: "demo2026" }).subscribe()

    store.logout()

    expect(logout).toHaveBeenCalledOnce()
    expect(store.session()).toBeNull()
    expect(store.isAuthenticated()).toBe(false)
  })
})
