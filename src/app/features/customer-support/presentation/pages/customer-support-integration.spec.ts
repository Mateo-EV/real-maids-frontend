import { Component, createEnvironmentInjector, EnvironmentInjector } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { By } from "@angular/platform-browser"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { NgIcon } from "@ng-icons/core"
import { HlmSidebarService } from "@spartan-ng/helm/sidebar"
import { ViewService } from "@ngneat/overview"
import { HotToastService } from "@ngxpert/hot-toast"
import { of } from "rxjs"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ADMIN_ROUTES } from "@/app/experiences/admin/admin.routes"
import { AdminSidebar } from "@/app/experiences/admin/presentation/components/admin-sidebar/admin-sidebar"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { authGuard } from "@/app/features/auth/presentation/guards/auth.guard"
import { provideCatalogToast } from "@/app/shared/notifications/catalog-toast"
import { CUSTOMER_SUPPORT_ROUTES } from "../../customer-support.routes"
import { SupportRequestsStore } from "../state/support-requests.store"
import { SupportRequestsPage } from "./support-requests-page/support-requests-page"

@Component({ template: "Login destination" })
class LoginDestination {}

@Component({ template: "" })
class Destination {}

/** D1/S11: entry D1 route group plus the navigation it is reachable from. */
describe("Customer support route group", () => {
  const entry = () => CUSTOMER_SUPPORT_ROUTES[0]

  it("lazily opens one guarded inbox under the protected admin shell", async () => {
    expect(CUSTOMER_SUPPORT_ROUTES).toHaveLength(2)
    const route = entry()
    expect(route.canActivate).toEqual([authGuard])
    expect(route.path).toBe("")
    expect(route.loadComponent).toBeTypeOf("function")
    expect(route.component).toBeUndefined()
    expect(await route.loadComponent!()).toBe(SupportRequestsPage)
    // T5 boundary: the group keeps this inbox route untouched and adds the guarded `:id`
    // detail as a sibling; its shape is asserted by the detail navigation spec.
    expect(route.children).toBeUndefined()
  })

  it("owns a complete route toast scope without re-providing root stores or auth", () => {
    const providers = entry().providers
    expect(providers).toEqual(expect.any(Array))
    TestBed.configureTestingModule({ providers: [] })
    const root = TestBed.inject(EnvironmentInjector)
    const reference = createEnvironmentInjector(provideCatalogToast(), root)
    const scope = createEnvironmentInjector(providers ?? [], root)
    try {
      const toast = scope.get(HotToastService, null, { self: true })
      const view = scope.get(ViewService, null, { self: true })
      expect(toast).not.toBeNull()
      expect(view).not.toBeNull()
      expect(toast!.defaultConfig).toEqual(reference.get(HotToastService).defaultConfig)
      for (const token of [SupportRequestsStore, AuthStore])
        expect(scope.get(token, null, { self: true })).toBeNull()
      expect(scope.get(SupportRequestsStore)).toBe(root.get(SupportRequestsStore))
    } finally {
      scope.destroy()
      reference.destroy()
    }
  })

  it("mounts as an additive lazy admin group without replacing the existing entries", async () => {
    const support = ADMIN_ROUTES[0].children!.find(route => route.path === "support")
    expect(support, "Missing lazy /admin/support route").toBeDefined()
    expect(support!.loadChildren).toBeTypeOf("function")
    expect(await support!.loadChildren!()).toBe(CUSTOMER_SUPPORT_ROUTES)
    expect(support!.canActivate).toBeUndefined()
    expect(support!.providers).toBeUndefined()
    expect(ADMIN_ROUTES[0].canActivate).toEqual([authGuard])
    const children = ADMIN_ROUTES[0].children!
    // P02/W4: the empty admin path is the dashboard entry, no longer a users redirect.
    expect(children.find(route => route.path === "")).toMatchObject({ pathMatch: "full" })
    expect(children.find(route => route.path === "")?.redirectTo).toBeUndefined()
    expect(children.find(route => route.path === "")?.loadChildren).toBeTypeOf("function")
    for (const path of ["users", "customers", "staff", "operations", "support"])
      expect(children.find(route => route.path === path)?.loadChildren).toBeTypeOf("function")
  })

  it("protects the guest deep link with the existing returnUrl contract and no private reads", async () => {
    const auth = {
      session: () => null,
      restoreSession: vi.fn(() => of(null)),
      logout: vi.fn()
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([...ADMIN_ROUTES, { path: "login", component: LoginDestination }]),
        { provide: AuthStore, useValue: auth }
      ]
    })
    const harness = await RouterTestingHarness.create("/admin/support")
    expect(auth.restoreSession).toHaveBeenCalled()
    expect(TestBed.inject(Router).url).toBe("/login?returnUrl=%2Fadmin%2Fsupport")
    expect(harness.routeNativeElement?.textContent).toContain("Login destination")
    expect(harness.routeNativeElement?.querySelector("app-admin-shell")).toBeNull()
    expect(harness.routeNativeElement?.querySelector("app-admin-sidebar")).toBeNull()
  })
})

describe("AdminSidebar Soporte navigation", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("adds exactly one enabled Soporte entry while preserving every pre-existing destination", async () => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      }
    )
    TestBed.configureTestingModule({
      imports: [AdminSidebar],
      providers: [
        HlmSidebarService,
        provideRouter([
          { path: "admin/support", component: Destination },
          { path: "admin/operations/requests", component: Destination },
          { path: "admin/customers", component: Destination },
          { path: "admin/staff", component: Destination },
          { path: "admin/users", component: Destination }
        ])
      ]
    })
    const fixture = TestBed.createComponent(AdminSidebar)
    fixture.detectChanges()
    await fixture.whenStable()
    const element = fixture.nativeElement as HTMLElement
    const general = element.querySelector('[role="group"][aria-label="General"]')!
    const administration = element.querySelector('[role="group"][aria-label="Administración"]')!
    // Every pre-existing entry keeps its position, label, icon and disabled state.
    expect(Array.from(general.querySelectorAll("li"), item => item.textContent?.trim())).toEqual([
      "Inicio",
      "Landing",
      "CRM",
      "RRHH",
      "Operaciones",
      "Soporte",
      "Reportes"
    ])
    for (const [path, label] of [
      ["/admin/customers", "CRM"],
      ["/admin/staff", "RRHH"],
      ["/admin/operations", "Operaciones"],
      ["/admin/support", "Soporte"]
    ]) {
      const link = general.querySelector<HTMLAnchorElement>(`a[href="${path}"]`)
      expect(link, `Missing ${label} destination`).not.toBeNull()
      expect(link!.textContent?.trim()).toBe(label)
      expect(link!.classList.contains("module-button")).toBe(true)
      expect(link!.querySelector('ng-icon[aria-hidden="true"]')).not.toBeNull()
    }
    const support = general.querySelector<HTMLAnchorElement>('a[href="/admin/support"]')!
    const icon = fixture.debugElement
      .queryAll(By.directive(NgIcon))
      .find(node => support.contains(node.nativeElement))!
    expect((icon.componentInstance as NgIcon).name()).toBe("lucideLifeBuoy")
    // Landing stays the only disabled, non-navigating module; IAM keeps its group and label.
    const disabled = Array.from(general.querySelectorAll<HTMLButtonElement>("button[disabled]"))
    expect(disabled).toHaveLength(1)
    expect(disabled[0].textContent?.trim()).toBe("Landing")
    expect(administration.querySelectorAll("a")).toHaveLength(1)
    expect(administration.querySelector("a")?.textContent?.trim()).toBe("IAM")
    // Exactly one added destination: four pre-existing anchors plus Soporte.
    expect(element.querySelectorAll("nav a")).toHaveLength(7)
    const router = TestBed.inject(Router)
    const current = () => element.querySelectorAll('[aria-current="page"]')
    for (const url of ["/admin/support"]) {
      await router.navigateByUrl(url)
      await fixture.whenStable()
      fixture.detectChanges()
      expect(support.getAttribute("aria-current")).toBe("page")
      expect(support.querySelector('.active-dot[aria-hidden="true"]')).not.toBeNull()
      expect(current()).toHaveLength(1)
    }
    for (const [url, path] of [
      ["/admin/customers", "/admin/customers"],
      ["/admin/staff", "/admin/staff"],
      ["/admin/operations/requests", "/admin/operations"],
      ["/admin/users", "/admin/users"]
    ]) {
      await router.navigateByUrl(url)
      await fixture.whenStable()
      fixture.detectChanges()
      expect(element.querySelector(`a[href="${path}"]`)!.getAttribute("aria-current"), url).toBe(
        "page"
      )
      expect(support.hasAttribute("aria-current")).toBe(false)
    }
    support.click()
    await fixture.whenStable()
    expect(router.url).toBe("/admin/support")
  })
})
