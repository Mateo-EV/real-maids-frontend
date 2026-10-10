import { Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { of } from "rxjs"
import { hlm } from "@spartan-ng/helm/utils"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { USER_REPOSITORY } from "@/app/features/users/domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "@/app/features/users/domain/repositories/role.repository"
import { UserInMemorySource } from "@/app/features/users/infrastructure/source/user-in-memory.source"
import { RoleInMemorySource } from "@/app/features/users/infrastructure/source/role-in-memory.source"
import { USER_SESSION_REPOSITORY } from "@/app/features/users/domain/repositories/user-session.repository"
import { UserSessionRepositoryImpl } from "@/app/features/users/infrastructure/repositories/user-session.repository-impl"
import { AUDIT_LOG_REPOSITORY } from "@/app/features/users/domain/repositories/audit-log.repository"
import { AuditLogRepositoryImpl } from "@/app/features/users/infrastructure/repositories/audit-log.repository-impl"
import { ADMIN_ROUTES } from "./admin.routes"

@Component({ template: "Login destination" })
class LoginDestination {}

function setup(authenticated: boolean) {
  const identity = { name: "Demo Identity", email: "identity@example.test" }
  const auth = {
    session: signal(authenticated ? identity : null),
    restoreSession: vi.fn(() => of(authenticated ? identity : null)),
    logout: vi.fn()
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([...ADMIN_ROUTES, { path: "login", component: LoginDestination }]),
      { provide: AuthStore, useValue: auth },
      { provide: USER_REPOSITORY, useExisting: UserInMemorySource },
      { provide: ROLE_REPOSITORY, useExisting: RoleInMemorySource },
      { provide: USER_SESSION_REPOSITORY, useExisting: UserSessionRepositoryImpl },
      { provide: AUDIT_LOG_REPOSITORY, useExisting: AuditLogRepositoryImpl }
    ]
  })
  return auth
}

describe("Admin users navigation", () => {
  // jsdom lacks layout observation; these tests assert semantics, not rendered geometry.
  beforeEach(() =>
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    )
  )
  afterEach(() => vi.unstubAllGlobals())
  it("protects deep links using session restoration and the original returnUrl contract", async () => {
    const auth = setup(false)
    await RouterTestingHarness.create("/admin/users")
    expect(auth.restoreSession).toHaveBeenCalled()
    expect(TestBed.inject(Router).url).toBe("/login?returnUrl=%2Fadmin%2Fusers")
  })
  it("protects the temporary entry route before rendering the shell", async () => {
    const auth = setup(false)
    const harness = await RouterTestingHarness.create("/admin")
    expect(auth.restoreSession).toHaveBeenCalled()
    // Angular resolves the empty-child redirect before evaluating the existing auth guard.
    expect(TestBed.inject(Router).url).toBe("/login?returnUrl=%2Fadmin%2Fusers")
    expect(harness.routeNativeElement?.querySelector("app-admin-sidebar")).toBeNull()
  })

  it("logs out from the shared shell and returns to login", async () => {
    const auth = setup(true)
    auth.logout.mockImplementation(() => auth.session.set(null))
    const harness = await RouterTestingHarness.create("/admin/users")
    const button = Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>("button")
    ).find(item => item.textContent?.includes("Salir"))!
    button.click()
    await harness.fixture.whenStable()
    expect(auth.logout).toHaveBeenCalledOnce()
    expect(auth.session()).toBeNull()
    expect(TestBed.inject(Router).url).toBe("/login")
  })

  it("redirects /admin to lazy users inside one shared shell", async () => {
    setup(true)
    const harness = await RouterTestingHarness.create("/admin")
    expect(TestBed.inject(Router).url).toBe("/admin/users")
    expect(harness.routeNativeElement?.textContent).toContain("Demo Identity")
    const link =
      harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href="/admin/users"]')
    expect(link?.textContent).toContain("IAM")
    expect(link?.getAttribute("aria-current")).toBe("page")
    expect(link?.querySelector('ng-icon[aria-hidden="true"]')).not.toBeNull()
    await harness.navigateByUrl("/admin/users")
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(TestBed.inject(Router).url).toBe("/admin/users")
    expect(harness.routeNativeElement?.textContent).toContain("Catálogo de Usuarios del Sistema")
    expect(harness.routeNativeElement?.tagName.toLowerCase()).toBe("app-admin-shell")
    expect(harness.routeNativeElement?.querySelectorAll("header")).toHaveLength(1)
    expect(harness.routeNativeElement?.querySelectorAll("app-admin-sidebar")).toHaveLength(1)
  })

  it("groups the five unavailable modules separately from the sole IAM destination", async () => {
    setup(true)
    const harness = await RouterTestingHarness.create("/admin/users")
    const sidebar = harness.routeNativeElement!.querySelector("app-admin-sidebar")!
    const nav = sidebar.querySelector('nav[aria-label="Navegación administrativa"]')!
    const general = nav.querySelector('[role="group"][aria-label="General"]')!
    const administration = nav.querySelector('[role="group"][aria-label="Administración"]')!
    expect(general).not.toBeNull()
    expect(administration).not.toBeNull()
    expect(
      Array.from(general.querySelectorAll("button"), button => button.textContent?.trim())
    ).toEqual(["Landing", "CRM", "RRHH", "Cotizaciones", "Programaciones"])
    expect(general.querySelectorAll("a")).toHaveLength(0)
    expect(administration.querySelectorAll("button")).toHaveLength(0)
    expect(nav.querySelectorAll("a")).toHaveLength(1)
    const iam = administration.querySelector("a")!
    expect(iam.textContent?.trim()).toBe("IAM")
    expect(iam.getAttribute("aria-current")).toBe("page")
    expect(iam.querySelector('.active-dot[aria-hidden="true"]')).not.toBeNull()
    expect(sidebar.querySelector('.brand-mark[aria-hidden="true"]')?.textContent).toBe("RM")
  })

  it("overrides only the desktop left separator through Helm's variant-aware container input", async () => {
    const separator = "group-data-[side=left]:border-r"
    const override = "group-data-[side=left]:border-r-0"
    // An unprefixed width does not remove the variant rule in the actual hlm merger.
    expect(hlm(separator, "border-r-0").split(" ")).toContain(separator)
    expect(hlm(separator, override)).toBe(override)
    setup(true)
    const harness = await RouterTestingHarness.create("/admin/users")
    const container = harness.routeNativeElement!.querySelector('[data-slot="sidebar-container"]')!
    expect(container.classList.contains(override)).toBe(true)
    expect(container.classList.contains(separator)).toBe(false)
    expect(container.classList.contains("group-data-[side=right]:border-l")).toBe(true)
    expect(harness.routeNativeElement!.querySelector('[data-slot="sidebar-gap"]')).not.toBeNull()
  })

  it("defaults the custom language choice to Spanish", async () => {
    setup(true)
    const harness = await RouterTestingHarness.create("/admin/users")
    expect(harness.routeNativeElement?.querySelector("hlm-select-value")?.textContent).toContain(
      "Español"
    )
  })

  it("shows the public development environment and Spanish visual language default", async () => {
    setup(true)
    const harness = await RouterTestingHarness.create("/admin/users")
    expect(harness.routeNativeElement?.textContent).toContain("Entorno: Desarrollo")
    expect(harness.routeNativeElement?.querySelector("hlm-select-value")?.textContent).toContain(
      "Español"
    )
  })

  it("renders disabled non-routing destinations and build-time environment with Spanish language default", async () => {
    setup(true)
    const harness = await RouterTestingHarness.create("/admin/users")
    await harness.fixture.whenStable()
    harness.detectChanges()
    const element = harness.routeNativeElement!
    const nav = element.querySelector('nav[aria-label="Navegación administrativa"]')!
    expect(nav).not.toBeNull()
    for (const label of ["Landing", "CRM", "RRHH", "Cotizaciones", "Programaciones"]) {
      const button = Array.from(nav.querySelectorAll<HTMLButtonElement>("button")).find(
        item => item.textContent?.trim() === label
      )!
      expect(button).toBeDefined()
      expect(button.querySelector('ng-icon[aria-hidden="true"]')).not.toBeNull()
      expect(button.disabled).toBe(true)
      expect(button.hasAttribute("routerLink")).toBe(false)
      button.click()
      expect(TestBed.inject(Router).url).toBe("/admin/users")
    }
    expect(element.textContent).toContain("Sistema seguro y activo")
    expect(element.textContent).toContain("Entorno: Desarrollo")
    expect(element.querySelector(".status-header select")).toBeNull()
    expect(element.querySelector('label[for="admin-language"]')?.textContent).toContain("Idioma")
    expect(element.querySelector("hlm-select-value")?.textContent).toContain("Español")
    expect(element.querySelector("button[hlmSidebarTrigger]")).not.toBeNull()
  })
})
