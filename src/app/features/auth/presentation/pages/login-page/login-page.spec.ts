import { GetCurrentUserUseCase } from "@/app/features/auth/application/use-cases/get-current-user.use-case"
import { LoginUseCase } from "@/app/features/auth/application/use-cases/login.use-case"
import { LogoutUseCase } from "@/app/features/auth/application/use-cases/logout.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { Result } from "@/app/shared/utils/result"
import { TestBed } from "@angular/core/testing"
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router"
import { describe, expect, it, vi } from "vitest"
import { LoginPage } from "./login-page"
import { EMPTY, firstValueFrom, of } from "rxjs"
import { ObserveAuthSessionUseCase } from "../../../application/use-cases/observe-auth-session.use-case"
import { InvalidateAuthSessionUseCase } from "../../../application/use-cases/invalidate-auth-session.use-case"
import { PASSWORD_CHANGE_PATH } from "../../routing/password-change-navigation"

describe("LoginPage", () => {
  function createPage(returnUrl?: string) {
    const navigateByUrl = vi.fn().mockResolvedValue(true)
    const navigate = vi.fn().mockResolvedValue(true)
    const login = vi.fn()

    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        AuthStore,
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => EMPTY } },
        { provide: InvalidateAuthSessionUseCase, useValue: { execute: vi.fn() } },
        { provide: GetCurrentUserUseCase, useValue: { execute: vi.fn() } },
        { provide: LoginUseCase, useValue: { execute: login } },
        { provide: LogoutUseCase, useValue: { execute: vi.fn() } },
        { provide: Router, useValue: { navigateByUrl, navigate } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ returnUrl }) } }
        }
      ]
    })

    return {
      fixture: TestBed.createComponent(LoginPage),
      navigateByUrl,
      navigate,
      store: TestBed.inject(AuthStore),
      login
    }
  }

  async function signIn(
    page: ReturnType<typeof createPage>,
    mustChangePassword: boolean
  ): Promise<void> {
    const session = AuthSession.create(
      "Cliente Portal",
      "cliente@example.test",
      "Cliente",
      null,
      9,
      4,
      "es",
      [],
      mustChangePassword
    )
    page.login.mockReturnValue(of(Result.success(session)))
    await firstValueFrom(page.store.login({ email: session.email, password: "provisional1" }))
  }

  it("renders the dedicated login form", () => {
    const { fixture } = createPage()

    fixture.detectChanges()

    expect(fixture.nativeElement.querySelector("app-login-form")).not.toBeNull()
  })

  it("navigates to the admin home after authentication", async () => {
    const { fixture, navigateByUrl } = createPage()

    await fixture.componentInstance.onAuthenticated()

    expect(navigateByUrl).toHaveBeenCalledWith("/admin")
  })

  it("preserves a safe return URL after authentication", async () => {
    const { fixture, navigateByUrl } = createPage("/admin/orders")

    await fixture.componentInstance.onAuthenticated()

    expect(navigateByUrl).toHaveBeenCalledWith("/admin/orders")
  })

  it("rejects an external return URL after authentication", async () => {
    const { fixture, navigateByUrl } = createPage("//malicious.example")

    await fixture.componentInstance.onAuthenticated()

    expect(navigateByUrl).toHaveBeenCalledWith("/admin")
  })

  it("sends a provisional password to the change screen instead of the destination", async () => {
    const page = createPage("/admin/orders")
    await signIn(page, true)

    await page.fixture.componentInstance.onAuthenticated()

    expect(page.navigate).toHaveBeenCalledWith([PASSWORD_CHANGE_PATH], {
      queryParams: { returnUrl: "/admin/orders" }
    })
    expect(page.navigateByUrl).not.toHaveBeenCalled()
  })

  it("still goes to the destination when the password is not provisional", async () => {
    const page = createPage("/admin/orders")
    await signIn(page, false)

    await page.fixture.componentInstance.onAuthenticated()

    expect(page.navigateByUrl).toHaveBeenCalledWith("/admin/orders")
    expect(page.navigate).not.toHaveBeenCalled()
  })

  it("does not forward a change-screen destination to the change screen again", async () => {
    const page = createPage("/change-password")
    await signIn(page, true)

    await page.fixture.componentInstance.onAuthenticated()

    expect(page.navigate).toHaveBeenCalledWith([PASSWORD_CHANGE_PATH], {
      queryParams: { returnUrl: "/admin" }
    })
  })
})
