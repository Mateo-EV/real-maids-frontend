import { ChangePasswordUseCase } from "@/app/features/auth/application/use-cases/change-password.use-case"
import { GetCurrentUserUseCase } from "@/app/features/auth/application/use-cases/get-current-user.use-case"
import { InvalidateAuthSessionUseCase } from "@/app/features/auth/application/use-cases/invalidate-auth-session.use-case"
import { LoginUseCase } from "@/app/features/auth/application/use-cases/login.use-case"
import { LogoutUseCase } from "@/app/features/auth/application/use-cases/logout.use-case"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { Result } from "@/app/shared/utils/result"
import { TestBed } from "@angular/core/testing"
import { EMPTY, of, Subject } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChangePasswordFormComponent } from "./change-password-form"

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
const draft = {
  currentPassword: "Provisional1",
  newPassword: "Definitiva2",
  confirmPassword: "Definitiva2"
}

describe("ChangePasswordFormComponent", () => {
  const changePassword = vi.fn()
  const me = vi.fn()

  beforeEach(() => {
    changePassword.mockReset()
    me.mockReset()
    const changes = new Subject<AuthSession | null>()
    TestBed.configureTestingModule({
      imports: [ChangePasswordFormComponent],
      providers: [
        AuthStore,
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
        { provide: InvalidateAuthSessionUseCase, useValue: { execute: vi.fn() } },
        { provide: LoginUseCase, useValue: { execute: vi.fn() } },
        { provide: LogoutUseCase, useValue: { execute: vi.fn() } },
        { provide: GetCurrentUserUseCase, useValue: { execute: me } },
        { provide: ChangePasswordUseCase, useValue: { execute: changePassword } }
      ]
    })
    changes.next(provisional)
  })

  function create() {
    const fixture = TestBed.createComponent(ChangePasswordFormComponent)
    fixture.detectChanges()
    return { fixture, component: fixture.componentInstance }
  }

  it("renders labelled fields with the documented help", () => {
    const { fixture } = create()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector('label[for="current-password"]')?.textContent).toContain(
      "Contraseña actual"
    )
    expect(element.querySelector('label[for="new-password"]')?.textContent).toContain(
      "Contraseña nueva"
    )
    expect(element.querySelector('label[for="confirm-password"]')?.textContent).toContain(
      "Confirma"
    )
    const help = element.querySelector("#password-policy-help")
    expect(help?.textContent).toContain("8 a 64 caracteres")
    expect(element.querySelector("#new-password")?.getAttribute("aria-describedby")).toContain(
      "password-policy-help"
    )
  })

  it("marks every field and does not dispatch an empty submit", async () => {
    const { component } = create()

    await component.submit()

    expect(component.passwordForm.currentPassword().touched()).toBe(true)
    expect(component.passwordForm.newPassword().touched()).toBe(true)
    expect(component.passwordForm.confirmPassword().touched()).toBe(true)
    expect(changePassword).not.toHaveBeenCalled()
  })

  it.each([
    ["short", "Definitiva2"],
    ["sinmayusculas1", "sinmayusculas1"],
    ["SinNumeros!", "SinNumeros!"]
  ])("applies the backend password policy to %s", async (newPassword, confirmPassword) => {
    const { component } = create()
    component.model.set({ currentPassword: "Provisional1", newPassword, confirmPassword })

    await component.submit()

    expect(component.passwordForm.newPassword().errors()).toEqual([
      expect.objectContaining({
        kind: "password",
        message: "Usa de 8 a 64 caracteres, con mayúscula, minúscula y número."
      })
    ])
    expect(changePassword).not.toHaveBeenCalled()
  })

  it("requires the confirmation to match", async () => {
    const { component } = create()
    component.model.set({ ...draft, confirmPassword: "Definitiva3" })

    await component.submit()

    expect(component.passwordForm.confirmPassword().errors()).toEqual([
      expect.objectContaining({ kind: "confirmation" })
    ])
    expect(changePassword).not.toHaveBeenCalled()
  })

  it("rejects a new password equal to the current one before dispatching", async () => {
    const { component } = create()
    component.model.set({
      currentPassword: "Definitiva2",
      newPassword: "Definitiva2",
      confirmPassword: "Definitiva2"
    })

    await component.submit()

    expect(component.passwordForm.newPassword().errors()).toEqual([
      expect.objectContaining({ kind: "unchanged" })
    ])
    expect(changePassword).not.toHaveBeenCalled()
  })

  it("emits the change only when the refreshed profile cleared the flag", async () => {
    const { component } = create()
    const changed = vi.fn()
    component.changed.subscribe(changed)
    changePassword.mockReturnValue(of(Result.success(settled)))
    component.model.set(draft)

    await component.submit()

    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "Provisional1",
      newPassword: "Definitiva2"
    })
    expect(changed).toHaveBeenCalledOnce()
    expect(component.failure()).toBeNull()
  })

  it("does not emit when the refreshed profile still carries the flag", async () => {
    const { component } = create()
    const changed = vi.fn()
    component.changed.subscribe(changed)
    changePassword.mockReturnValue(of(Result.success(provisional)))
    component.model.set(draft)

    await component.submit()

    expect(changed).not.toHaveBeenCalled()
    expect(component.failure()).toBe("unconfirmed")
  })

  it("keeps the draft and reports a rejected change inline", async () => {
    const { fixture, component } = create()
    changePassword.mockReturnValue(of(Result.failure(new AuthError("INVALID_PASSWORD_CHANGE"))))
    component.model.set(draft)

    await component.submit()
    fixture.detectChanges()

    expect(component.failure()).toBe("rejected")
    expect(component.model()).toEqual(draft)
    expect(component.passwordForm().submitting()).toBe(false)
    const alert = (fixture.nativeElement as HTMLElement).querySelector("[role='alert']")
    expect(alert?.textContent).toContain("No pudimos cambiar tu contraseña")
    expect(alert?.textContent).not.toContain("raw backend")
  })

  it("blocks a duplicate submit while the change is pending", async () => {
    const { component } = create()
    const response = new Subject<Result<AuthSession, AuthError>>()
    changePassword.mockReturnValue(response)
    component.model.set(draft)

    const first = component.submit()
    const second = component.submit()

    expect(await second).toBe(false)
    expect(changePassword).toHaveBeenCalledOnce()
    response.next(Result.success(settled))
    response.complete()
    await first
  })

  it("confirms an unconfirmed outcome with a profile-only retry", async () => {
    const { component } = create()
    const changed = vi.fn()
    component.changed.subscribe(changed)
    changePassword.mockReturnValue(of(Result.failure(new AuthError("NETWORK"))))
    component.model.set(draft)

    await component.submit()
    expect(component.failure()).toBe("unconfirmed")
    expect(changed).not.toHaveBeenCalled()

    me.mockReturnValue(of(Result.success(settled)))
    await component.checkStatus()

    expect(me).toHaveBeenCalledWith(true)
    expect(changePassword).toHaveBeenCalledOnce()
    expect(changed).toHaveBeenCalledOnce()
    expect(component.failure()).toBeNull()
  })

  it("keeps the screen when the retry cannot confirm the change", async () => {
    const { component } = create()
    changePassword.mockReturnValue(of(Result.failure(new AuthError("NETWORK"))))
    component.model.set(draft)
    await component.submit()

    me.mockReturnValue(of(Result.success(provisional)))
    await component.checkStatus()

    expect(component.failure()).toBe("unconfirmed")
  })

  it("stays silent after destruction", async () => {
    const { fixture, component } = create()
    const changed = vi.fn()
    const response = new Subject<Result<AuthSession, AuthError>>()
    component.changed.subscribe(changed)
    changePassword.mockReturnValue(response)
    component.model.set(draft)

    const pending = component.submit()
    await Promise.resolve()
    fixture.destroy()
    response.next(Result.success(settled))
    response.complete()
    await pending

    expect(changed).not.toHaveBeenCalled()
    expect(component.failure()).toBeNull()
    expect(component.model()).toEqual(draft)
  })

  it("toggles the new password visibility", () => {
    const { component } = create()
    expect(component.newPasswordVisible()).toBe(false)
    component.toggleNewPasswordVisibility()
    expect(component.newPasswordVisible()).toBe(true)
  })
})
