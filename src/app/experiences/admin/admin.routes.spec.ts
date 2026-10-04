import { Component, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { USER_REPOSITORY } from "@/app/features/users/domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "@/app/features/users/domain/repositories/role.repository"
import { UserInMemorySource } from "@/app/features/users/infrastructure/source/user-in-memory.source"
import { RoleInMemorySource } from "@/app/features/users/infrastructure/source/role-in-memory.source"
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
      { provide: ROLE_REPOSITORY, useExisting: RoleInMemorySource }
    ]
  })
  return auth
}

describe("Admin users navigation", () => {
  it("protects deep links using session restoration and the original returnUrl contract", async () => {
    const auth = setup(false)
    await RouterTestingHarness.create("/admin/users")
    expect(auth.restoreSession).toHaveBeenCalled()
    expect(TestBed.inject(Router).url).toBe("/login?returnUrl=%2Fadmin%2Fusers")
  })
  it("keeps /admin as the temporary home and connects the lazy users feature", async () => {
    setup(true)
    const harness = await RouterTestingHarness.create("/admin")
    expect(harness.routeNativeElement?.textContent).toContain("Bienvenido, Demo Identity")
    const link =
      harness.routeNativeElement?.querySelector<HTMLAnchorElement>('a[href="/admin/users"]')
    expect(link?.textContent).toContain("Administración de usuarios")
    await harness.navigateByUrl("/admin/users")
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(TestBed.inject(Router).url).toBe("/admin/users")
    expect(harness.routeNativeElement?.textContent).toContain("Catálogo de Usuarios del Sistema")
  })
})
