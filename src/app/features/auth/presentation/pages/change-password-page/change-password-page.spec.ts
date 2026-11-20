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
import { By } from "@angular/platform-browser"
import { TestBed } from "@angular/core/testing"
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router"
import { EMPTY, of, Subject } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ChangePasswordFormComponent } from "../../components/change-password-form/change-password-form"
import { ChangePasswordPage } from "./change-password-page"

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

describe("ChangePasswordPage", () => {
  const changePassword = vi.fn()
  const logout = vi.fn()
  const navigateByUrl = vi.fn().mockResolvedValue(true)

  beforeEach(() => {
    changePassword.mockReset()
    logout.mockReset()
    navigateByUrl.mockClear()
    const changes = new Subject<AuthSession | null>()
    TestBed.configureTestingModule({
      imports: [ChangePasswordPage],
      providers: [
        AuthStore,
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
        { provide: InvalidateAuthSessionUseCase, useValue: { execute: vi.fn() } },
        { provide: LoginUseCase, useValue: { execute: vi.fn() } },
        { provide: LogoutUseCase, useValue: { execute: logout } },
        { provide: GetCurrentUserUseCase, useValue: { execute: vi.fn() } },
        { provide: ChangePasswordUseCase, useValue: { execute: changePassword } },
        { provide: Router, useValue: { navigateByUrl } }
      ]
    })
    TestBed.overrideProvider(ActivatedRoute, {
      useValue: { snapshot: { queryParamMap: convertToParamMap({}) } }
    })
    changes.next(provisional)
  })

  function create(returnUrl?: string) {
    if (returnUrl !== undefined)
      TestBed.overrideProvider(ActivatedRoute, {
        useValue: { snapshot: { queryParamMap: convertToParamMap({ returnUrl }) } }
      })
    const fixture = TestBed.createComponent(ChangePasswordPage)
    fixture.detectChanges()
    const form = fixture.debugElement.query(By.directive(ChangePasswordFormComponent))
      .componentInstance as ChangePasswordFormComponent
    return { fixture, form }
  }

  it("renders the forced change screen with a way out", () => {
    const { fixture } = create()
    const element = fixture.nativeElement as HTMLElement
    expect(element.querySelector("app-change-password-form")).not.toBeNull()
    expect(element.querySelector("button[data-sign-out]")?.textContent).toContain("Cerrar sesión")
  })

  it("continues to the captured destination once the change is confirmed", async () => {
    const { form } = create("/admin/orders?status=open")
    changePassword.mockReturnValue(of(Result.success(settled)))
    form.model.set({
      currentPassword: "Provisional1",
      newPassword: "Definitiva2",
      confirmPassword: "Definitiva2"
    })

    await form.submit()

    expect(navigateByUrl).toHaveBeenCalledWith("/admin/orders?status=open")
  })

  it.each([undefined, "//malicious.example", "/change-password"])(
    "falls back to the admin home for an unusable destination: %j",
    async returnUrl => {
      const { form } = create(returnUrl)
      changePassword.mockReturnValue(of(Result.success(settled)))
      form.model.set({
        currentPassword: "Provisional1",
        newPassword: "Definitiva2",
        confirmPassword: "Definitiva2"
      })

      await form.submit()

      expect(navigateByUrl).toHaveBeenCalledWith("/admin")
    }
  )

  it("does not navigate when the change is rejected", async () => {
    const { form } = create("/admin/orders")
    changePassword.mockReturnValue(of(Result.failure(new AuthError("INVALID_PASSWORD_CHANGE"))))
    form.model.set({
      currentPassword: "Provisional1",
      newPassword: "Definitiva2",
      confirmPassword: "Definitiva2"
    })

    await form.submit()

    expect(navigateByUrl).not.toHaveBeenCalled()
    expect(form.failure()).toBe("rejected")
  })

  it("always allows signing out of the forced step", async () => {
    const { fixture } = create("/admin/orders")
    const button = (fixture.nativeElement as HTMLElement).querySelector(
      "button[data-sign-out]"
    ) as HTMLButtonElement

    button.click()
    await fixture.whenStable()

    expect(logout).toHaveBeenCalledOnce()
    expect(navigateByUrl).toHaveBeenCalledWith("/login")
  })
})
