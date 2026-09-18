import { AuthService } from "@/app/admin/features/auth/application/services/auth.service"
import { AuthStore } from "@/app/admin/features/auth/presentation/state/auth.store"
import { TestBed } from "@angular/core/testing"
import { ActivatedRoute, convertToParamMap, Router } from "@angular/router"
import { describe, expect, it, vi } from "vitest"
import { LoginPage } from "./login-page"

describe("LoginPage", () => {
  function createPage(returnUrl?: string) {
    const navigateByUrl = vi.fn().mockResolvedValue(true)

    TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        AuthStore,
        { provide: AuthService, useValue: { login: vi.fn() } },
        { provide: Router, useValue: { navigateByUrl } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({ returnUrl }) } }
        }
      ]
    })

    return { fixture: TestBed.createComponent(LoginPage), navigateByUrl }
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
})
