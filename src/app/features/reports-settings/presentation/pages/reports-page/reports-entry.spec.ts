import { createEnvironmentInjector, EnvironmentInjector } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { ViewService } from "@ngneat/overview"
import { HotToastService } from "@ngxpert/hot-toast"
import { HlmSidebarService } from "@spartan-ng/helm/sidebar"
import { of } from "rxjs"
import { afterEach, describe, expect, it } from "vitest"
import { appConfig } from "@/app/core/config/app.config"
import { ADMIN_ROUTES } from "@/app/experiences/admin/admin.routes"
import { AdminSidebar } from "@/app/experiences/admin/presentation/components/admin-sidebar/admin-sidebar"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { provideCatalogToast } from "@/app/shared/notifications/catalog-toast"
import { ReportsPage } from "./reports-page"
import { REPORTS_SETTINGS_ROUTES } from "../../../reports-settings.routes"

afterEach(() => TestBed.resetTestingModule())

// W6 / S4: `/admin/reports` is a guarded lazy screen and `Reportes` is a real sidebar entry.
describe("Reports route", () => {
  it("lazily composes the reports page at /admin/reports behind the existing auth guard", async () => {
    const reports = ADMIN_ROUTES[0].children!.find(route => route.path === "reports")
    expect(reports, "Missing lazy /admin/reports route").toBeDefined()
    expect(reports!.loadChildren).toBeTypeOf("function")
    expect(reports!.component).toBeUndefined()
    expect(reports!.providers).toBeUndefined()
    expect(await reports!.loadChildren!()).toBe(REPORTS_SETTINGS_ROUTES)
    expect(REPORTS_SETTINGS_ROUTES).toHaveLength(1)
    const screen = REPORTS_SETTINGS_ROUTES[0]
    expect(screen.path).toBe("")
    expect(screen.canActivate).toEqual([authGuard])
    expect(screen.loadComponent).toBeTypeOf("function")
    expect(await screen.loadComponent!()).toBe(ReportsPage)
  })

  it("owns a complete toast scope while inheriting the root stores", () => {
    TestBed.configureTestingModule({ providers: appConfig.providers })
    const root = TestBed.inject(EnvironmentInjector)
    const reference = createEnvironmentInjector(provideCatalogToast(), root)
    const scope = createEnvironmentInjector(REPORTS_SETTINGS_ROUTES[0].providers ?? [], root)
    try {
      const toast = scope.get(HotToastService, null, { self: true })
      const view = scope.get(ViewService, null, { self: true })
      expect(toast).not.toBeNull()
      expect(view).not.toBeNull()
      expect(toast!.defaultConfig).toEqual(reference.get(HotToastService).defaultConfig)
      expect(scope.get(AuthStore, null, { self: true })).toBeNull()
      expect(scope.get(AuthStore)).toBe(root.get(AuthStore))
    } finally {
      scope.destroy()
      reference.destroy()
    }
  })

  it("redirects a guest deep link to login with the returnUrl contract and no shell", async () => {
    const anonymous: AuthSession | null = null
    TestBed.configureTestingModule({
      providers: [
        provideRouter([...ADMIN_ROUTES, { path: "login", component: AdminSidebar }]),
        {
          provide: AuthStore,
          useValue: {
            session: () => anonymous,
            restoreSession: () => of(anonymous),
            logout: () => undefined
          }
        },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => of(anonymous) } }
      ]
    })
    const harness = await RouterTestingHarness.create("/admin/reports")
    expect(TestBed.inject(Router).url).toBe("/login?returnUrl=%2Fadmin%2Freports")
    expect(harness.routeNativeElement?.querySelector("app-admin-sidebar")).toBeNull()
  })
})

// W6 / S4: the approved `Reportes` entry lives in General after Soporte.
describe("Reportes sidebar entry", () => {
  it("lists Reportes after Soporte as a real, enabled link to /admin/reports", () => {
    TestBed.configureTestingModule({
      imports: [AdminSidebar],
      providers: [
        HlmSidebarService,
        provideRouter([{ path: "admin/reports", component: AdminSidebar }])
      ]
    })
    const fixture = TestBed.createComponent(AdminSidebar)
    fixture.detectChanges()
    const element = fixture.nativeElement as HTMLElement
    const general = element.querySelector('[role="group"][aria-label="General"]')!
    expect(Array.from(general.querySelectorAll("li"), item => item.textContent?.trim())).toEqual([
      "Landing",
      "CRM",
      "RRHH",
      "Operaciones",
      "Soporte",
      "Reportes"
    ])
    const reports = general.querySelector<HTMLAnchorElement>('a[href="/admin/reports"]')
    expect(reports, "Missing Reportes anchor to /admin/reports").not.toBeNull()
    expect(reports!.textContent?.trim()).toBe("Reportes")
    expect(reports!.classList.contains("module-button")).toBe(true)
    expect(reports!.querySelector('ng-icon[aria-hidden="true"]')).not.toBeNull()
    expect(reports!.querySelector('.active-dot[aria-hidden="true"]')).not.toBeNull()
    expect(reports!.hasAttribute("disabled")).toBe(false)
    // Landing stays the only disabled, non-navigating destination.
    expect(general.querySelectorAll("button[disabled]")).toHaveLength(1)
  })
})
