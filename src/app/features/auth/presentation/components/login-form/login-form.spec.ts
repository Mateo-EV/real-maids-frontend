import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { GetCurrentUserUseCase } from "@/app/features/auth/application/use-cases/get-current-user.use-case"
import { LoginUseCase } from "@/app/features/auth/application/use-cases/login.use-case"
import { LogoutUseCase } from "@/app/features/auth/application/use-cases/logout.use-case"
import { UserSession } from "@/app/features/auth/domain/entities/user-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { Result } from "@/app/shared/utils/result"
import { TestBed } from "@angular/core/testing"
import { EMPTY, of, Subject, throwError } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { LoginFormComponent } from "./login-form"

const demoCredentials = { name: "Mateo", email: "riojamatthew@gmail.com", password: "demo2026" }

describe("LoginFormComponent", () => {
  const login = vi.fn()

  beforeEach(() => {
    login.mockReset()

    TestBed.configureTestingModule({
      imports: [LoginFormComponent],
      providers: [
        AuthStore,
        { provide: GetCurrentUserUseCase, useValue: { execute: vi.fn() } },
        { provide: LoginUseCase, useValue: { execute: login } },
        { provide: LogoutUseCase, useValue: { execute: vi.fn() } }
      ]
    })
  })

  it("uses shared primary and foreground classes on the login action", () => {
    const fixture = TestBed.createComponent(LoginFormComponent)
    fixture.detectChanges()
    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(button.textContent).toContain("Iniciar sesión")
    expect(button.classList.contains("bg-primary")).toBe(true)
    expect(button.classList.contains("text-primary-foreground")).toBe(true)
    expect(button.style.getPropertyValue("--primary")).toBe("")
  })

  it("marks invalid fields and does not submit an empty form", async () => {
    const fixture = TestBed.createComponent(LoginFormComponent)

    await fixture.componentInstance.submit()

    expect(fixture.componentInstance.loginForm.email().touched()).toBe(true)
    expect(fixture.componentInstance.loginForm.password().touched()).toBe(true)
    expect(login).not.toHaveBeenCalled()
  })

  it("shows a recoverable error when credentials are rejected", async () => {
    const fixture = TestBed.createComponent(LoginFormComponent)
    login.mockReturnValue(of(Result.failure(new AuthError("INVALID_CREDENTIALS"))))
    fixture.componentInstance.loginForm().value.set({
      email: "wrong@realmaids.com",
      password: "incorrecta"
    })

    await fixture.componentInstance.submit()
    fixture.detectChanges()

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null
    expect(alert?.textContent).toContain("No pudimos iniciar tu sesión")
    expect(alert?.textContent).not.toContain("prueba")
  })

  it("emits authenticated after a successful login", async () => {
    const fixture = TestBed.createComponent(LoginFormComponent)
    const authenticated = vi.fn()
    const session = UserSession.create(demoCredentials.name, demoCredentials.email)
    login.mockReturnValue(of(Result.success(session)))
    fixture.componentInstance.authenticated.subscribe(authenticated)
    fixture.componentInstance.loginForm().value.set({
      email: demoCredentials.email,
      password: demoCredentials.password
    })

    await fixture.componentInstance.submit()

    expect(authenticated).toHaveBeenCalledOnce()
  })

  it.each(["success", "failure"])(
    "cancels a pending login on destruction without late %s feedback",
    async outcome => {
      const fixture = TestBed.createComponent(LoginFormComponent)
      const component = fixture.componentInstance
      const store = TestBed.inject(AuthStore)
      const response = new Subject<Result<UserSession, AuthError>>()
      login.mockReturnValue(response)
      const authenticated = vi.fn()
      component.authenticated.subscribe(authenticated)
      component.loginModel.set({ email: "login@example.test", password: "password123" })
      const pending = component.submit()
      await Promise.resolve()
      expect(response.observed).toBe(true)
      fixture.destroy()
      expect(response.observed).toBe(false)
      response.next(
        outcome === "success"
          ? Result.success(UserSession.create("Late", "late@example.test"))
          : Result.failure(new AuthError("INVALID_CREDENTIALS"))
      )
      response.complete()
      await pending
      expect(authenticated).not.toHaveBeenCalled()
      expect(component.submitError()).toBeNull()
      expect(component.loginModel().password).toBe("password123")
      expect(component.loginForm().submitting()).toBe(false)
      expect(store.session()).toBeNull()
    }
  )

  it("settles empty completion without authentication, feedback or form reset", async () => {
    const fixture = TestBed.createComponent(LoginFormComponent)
    const component = fixture.componentInstance
    login.mockReturnValue(EMPTY)
    const authenticated = vi.fn()
    component.authenticated.subscribe(authenticated)
    component.loginModel.set({ email: "login@example.test", password: "password123" })
    await component.submit()
    expect(authenticated).not.toHaveBeenCalled()
    expect(component.submitError()).toBeNull()
    expect(component.loginForm().submitting()).toBe(false)
    expect(component.loginModel().password).toBe("password123")
  })

  it("unlocks the form with recoverable feedback after an unexpected request error", async () => {
    const fixture = TestBed.createComponent(LoginFormComponent)
    login.mockReturnValue(throwError(() => new Error("offline")))
    fixture.componentInstance.loginModel.set({
      email: "login@example.test",
      password: "password123"
    })
    await fixture.componentInstance.submit()
    expect(fixture.componentInstance.submitError()?.code).toBe("UNEXPECTED")
    expect(fixture.componentInstance.loginForm().submitting()).toBe(false)
  })

  it("toggles password visibility", () => {
    const fixture = TestBed.createComponent(LoginFormComponent)

    fixture.componentInstance.togglePasswordVisibility()

    expect(fixture.componentInstance.passwordVisible()).toBe(true)
  })
})
