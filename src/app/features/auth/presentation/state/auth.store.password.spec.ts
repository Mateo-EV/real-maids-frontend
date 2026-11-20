import { ChangePasswordUseCase } from "@/app/features/auth/application/use-cases/change-password.use-case"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { Result } from "@/app/shared/utils/result"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, Subject } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { GetCurrentUserUseCase } from "../../application/use-cases/get-current-user.use-case"
import { InvalidateAuthSessionUseCase } from "../../application/use-cases/invalidate-auth-session.use-case"
import { LoginUseCase } from "../../application/use-cases/login.use-case"
import { LogoutUseCase } from "../../application/use-cases/logout.use-case"
import { ObserveAuthSessionUseCase } from "../../application/use-cases/observe-auth-session.use-case"
import { AuthStore } from "./auth.store"

const provisional = AuthSession.create(
  "Cliente Portal",
  "cliente@example.test",
  "Cliente",
  null,
  12,
  4,
  "es",
  [],
  true
)
const settled = AuthSession.create(
  "Cliente Portal",
  "cliente@example.test",
  "Cliente",
  null,
  12,
  4,
  "es",
  [],
  false
)
const parameters = { currentPassword: "Provisional1", newPassword: "Definitiva2" }

describe("AuthStore forced password change", () => {
  const changePassword = vi.fn()
  const me = vi.fn()
  const invalidate = vi.fn()
  const logout = vi.fn()
  let changes: Subject<AuthSession | null>
  let store: InstanceType<typeof AuthStore>

  beforeEach(() => {
    changePassword.mockReset()
    me.mockReset()
    invalidate.mockReset()
    logout.mockReset()
    changes = new Subject()
    TestBed.configureTestingModule({
      providers: [
        AuthStore,
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
        { provide: InvalidateAuthSessionUseCase, useValue: { execute: invalidate } },
        { provide: LoginUseCase, useValue: { execute: vi.fn() } },
        { provide: LogoutUseCase, useValue: { execute: logout } },
        { provide: GetCurrentUserUseCase, useValue: { execute: me } },
        { provide: ChangePasswordUseCase, useValue: { execute: changePassword } }
      ]
    })
    store = TestBed.inject(AuthStore)
  })

  function publish(session: AuthSession): void {
    changes.next(session)
  }

  it("exposes the pending flag from the authenticated profile", () => {
    expect(store.mustChangePassword()).toBe(false)
    publish(provisional)
    expect(store.isAuthenticated()).toBe(true)
    expect(store.mustChangePassword()).toBe(true)
    publish(settled)
    expect(store.mustChangePassword()).toBe(false)
  })

  it("keeps the refreshed profile after a confirmed change", async () => {
    publish(provisional)
    changePassword.mockReturnValue(of(Result.success(settled)))

    const result = await firstValueFrom(store.changePassword(parameters))

    expect(changePassword).toHaveBeenCalledWith(parameters)
    expect(result).toMatchObject({ success: true })
    expect(store.session()).toBe(settled)
    expect(store.mustChangePassword()).toBe(false)
    expect(store.isAuthenticated()).toBe(true)
    expect(logout).not.toHaveBeenCalled()
  })

  it("keeps the session and the flag when the change is rejected", async () => {
    publish(provisional)
    changePassword.mockReturnValue(of(Result.failure(new AuthError("INVALID_PASSWORD_CHANGE"))))

    const result = await firstValueFrom(store.changePassword(parameters))

    expect(result).toMatchObject({ success: false, error: { code: "INVALID_PASSWORD_CHANGE" } })
    expect(store.session()).toBe(provisional)
    expect(store.mustChangePassword()).toBe(true)
    expect(invalidate).not.toHaveBeenCalled()
    expect(logout).not.toHaveBeenCalled()
  })

  it("rejects a change that completes after logout", async () => {
    publish(provisional)
    const response = new Subject<Result<AuthSession, AuthError>>()
    changePassword.mockReturnValue(response)
    const pending = firstValueFrom(store.changePassword(parameters))
    store.logout()
    response.next(Result.success(settled))
    expect(await pending).toMatchObject({ success: false, error: { code: "CANCELLED" } })
    expect(store.session()).toBeNull()
  })

  it("re-reads the profile without dropping a verified session on failure", async () => {
    publish(provisional)
    me.mockReturnValue(of(Result.failure(new AuthError("NETWORK"))))

    expect(await firstValueFrom(store.refreshSession())).toBe(provisional)
    expect(me).toHaveBeenCalledWith(true)
    expect(store.session()).toBe(provisional)
    expect(store.mustChangePassword()).toBe(true)

    me.mockReturnValue(of(Result.success(settled)))
    expect(await firstValueFrom(store.refreshSession())).toBe(settled)
    expect(store.mustChangePassword()).toBe(false)
  })
})
