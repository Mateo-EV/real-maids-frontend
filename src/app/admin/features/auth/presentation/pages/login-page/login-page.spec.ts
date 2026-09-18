import { TestBed } from "@angular/core/testing"
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router"
import { of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { AuthError } from "@/app/admin/features/auth/application/errors/auth.error"
import { AuthService } from "@/app/admin/features/auth/application/services/auth.service"
import { UserSession } from "@/app/admin/features/auth/domain/entities/user-session.entity"
import { DEMO_AUTH } from "@/app/admin/features/auth/auth.demo"
import { LoginPage } from "./login-page"

describe("LoginPage", () => {
  const login = vi.fn()
  const navigateByUrl = vi.fn().mockResolvedValue(true)

  beforeEach(() => {
    login.mockReset()
    navigateByUrl.mockClear()

    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        { provide: AuthService, useValue: { login } },
        { provide: Router, useValue: { navigateByUrl } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } }
        }
      ]
    })
  })

  it("marks invalid fields and does not submit an empty form", async () => {
    const fixture = TestBed.createComponent(LoginPage)

    await fixture.componentInstance.submit()

    expect(fixture.componentInstance.loginForm.email().touched()).toBe(true)
    expect(fixture.componentInstance.loginForm.password().touched()).toBe(true)
    expect(login).not.toHaveBeenCalled()
  })

  it("fills the documented demo credentials", () => {
    const fixture = TestBed.createComponent(LoginPage)

    fixture.componentInstance.fillDemoCredentials()

    expect(fixture.componentInstance.loginForm().value()).toEqual({
      email: DEMO_AUTH.email,
      password: DEMO_AUTH.password
    })
  })

  it("shows a recoverable error when credentials are rejected", async () => {
    const fixture = TestBed.createComponent(LoginPage)
    login.mockReturnValue(of(Result.failure(new AuthError("INVALID_CREDENTIALS"))))
    fixture.componentInstance.loginForm().value.set({
      email: "wrong@realmaids.com",
      password: "incorrecta"
    })

    await fixture.componentInstance.submit()
    fixture.detectChanges()

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null
    expect(alert?.textContent).toContain("No pudimos iniciar tu sesión")
    expect(navigateByUrl).not.toHaveBeenCalled()
  })

  it("navigates to the admin home after a successful login", async () => {
    const fixture = TestBed.createComponent(LoginPage)
    const session = UserSession.create(DEMO_AUTH.name, DEMO_AUTH.email)
    login.mockReturnValue(of(Result.success(session)))
    fixture.componentInstance.loginForm().value.set({
      email: DEMO_AUTH.email,
      password: DEMO_AUTH.password
    })

    await fixture.componentInstance.submit()

    expect(navigateByUrl).toHaveBeenCalledWith("/admin")
  })
})
