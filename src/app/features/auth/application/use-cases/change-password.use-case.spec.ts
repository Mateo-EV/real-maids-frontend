import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { AuthError } from "../../domain/errors/auth.error"
import { AuthSession } from "../../domain/entities/auth-session.entity"
import { AUTH_REPOSITORY } from "../../domain/repositories/auth.repository"
import { ChangePasswordUseCase } from "./change-password.use-case"

describe("ChangePasswordUseCase", () => {
  const changePassword = vi.fn()
  const me = vi.fn()
  const parameters = { currentPassword: "Provisional1", newPassword: "Definitiva2" }
  let useCase: ChangePasswordUseCase

  beforeEach(() => {
    changePassword.mockReset()
    me.mockReset()
    TestBed.configureTestingModule({
      providers: [{ provide: AUTH_REPOSITORY, useValue: { changePassword, me } }]
    })
    useCase = TestBed.inject(ChangePasswordUseCase)
  })

  it("re-reads the profile only after a confirmed change", async () => {
    changePassword.mockReturnValue(of(Result.success<void>(undefined)))
    const refreshed = AuthSession.create("Cliente", "cliente@example.test")
    me.mockReturnValue(of(Result.success(refreshed)))

    const result = await firstValueFrom(useCase.execute(parameters))

    expect(changePassword).toHaveBeenCalledWith(parameters)
    expect(me).toHaveBeenCalledWith(true)
    expect(result).toMatchObject({ success: true })
    expect(result.success && result.data).toBe(refreshed)
  })

  it("does not re-read the profile when the change is rejected", async () => {
    const error = new AuthError("INVALID_PASSWORD_CHANGE")
    changePassword.mockReturnValue(of(Result.failure(error)))

    expect(await firstValueFrom(useCase.execute(parameters))).toMatchObject({
      success: false,
      error: { code: "INVALID_PASSWORD_CHANGE" }
    })
    expect(me).not.toHaveBeenCalled()
  })

  it("reports an unconfirmed outcome when the forced read fails after the write", async () => {
    changePassword.mockReturnValue(of(Result.success<void>(undefined)))
    me.mockReturnValue(of(Result.failure(new AuthError("NETWORK"))))

    expect(await firstValueFrom(useCase.execute(parameters))).toMatchObject({
      success: false,
      error: { code: "NETWORK" }
    })
  })
})
