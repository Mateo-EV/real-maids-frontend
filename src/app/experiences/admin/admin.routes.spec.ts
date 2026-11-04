import { Component, inject, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter, Router } from "@angular/router"
import { RouterTestingHarness } from "@angular/router/testing"
import { firstValueFrom, of, Subject, map, BehaviorSubject } from "rxjs"
import { provideHttpClient } from "@angular/common/http"
import { HttpTestingController, provideHttpClientTesting } from "@angular/common/http/testing"
import { API_URL } from "@/app/core/tokens/api-url.token"
import { provideFieldOperationsReads } from "@/app/features/field-operations/field-operations.providers"
import { FIELD_OPERATIONS_ROUTES } from "@/app/features/field-operations/field-operations.routes"
import { FieldStaffStore } from "@/app/features/field-operations/presentation/state/field-staff.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { UserListQuery } from "@/app/features/users/domain/models/user-list-query"
import { Result } from "@/app/shared/utils/result"
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
import { ListCustomersUseCase } from "@/app/features/customers/application/use-cases/list-customers.use-case"
import { UserStore } from "@/app/features/users/presentation/state/user.store"
import { ListLeadsUseCase } from "@/app/features/customers/application/use-cases/acquisition.use-cases"
import { GetCustomerByIdUseCase } from "@/app/features/customers/application/use-cases/get-customer-by-id.use-case"

@Component({ template: "Login destination" })
class LoginDestination {}

function setup(authenticated: boolean) {
  const identity = AuthSession.create("Demo Identity", "identity@example.test", null, null, 1)
  const sessionChanges = new Subject<AuthSession | null>()
  const session = signal<AuthSession | null>(authenticated ? identity : null)
  const auth = {
    session,
    restoreSession: vi.fn(() => of(session())),
    logout: vi.fn(() => {
      session.set(null)
      sessionChanges.next(null)
    })
  }
  TestBed.configureTestingModule({
    providers: [
      provideRouter([...ADMIN_ROUTES, { path: "login", component: LoginDestination }]),
      { provide: AuthStore, useValue: auth },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => sessionChanges } },
      {
        provide: USER_REPOSITORY,
        useFactory: () => {
          const source = inject(UserInMemorySource)
          return {
            getUsersPage: (query: UserListQuery) =>
              source.getUsers().pipe(
                map(result => {
                  if (!result.success) return result
                  const offset = query.offset ?? 0,
                    limit = query.limit ?? 20
                  return Result.success({
                    items: result.data.slice(offset, offset + limit),
                    total: result.data.length,
                    offset,
                    limit
                  })
                })
              ),
            getUserStatistics: () =>
              source.getUsers().pipe(
                map(result => {
                  if (!result.success) return result
                  const total = result.data.length,
                    active = result.data.filter(user => user.isActive).length
                  return Result.success({ total, active, inactive: total - active })
                })
              )
          }
        }
      },
      { provide: ROLE_REPOSITORY, useExisting: RoleInMemorySource },
      { provide: USER_SESSION_REPOSITORY, useExisting: UserSessionRepositoryImpl },
      { provide: AUDIT_LOG_REPOSITORY, useExisting: AuditLogRepositoryImpl }
    ]
  })
  return auth
}

// WP7 T4 / S1,S3: public staff integration alongside the preserved IAM/CRM contracts.
describe("Admin staff route integration", () => {
  const api = "http://localhost:8080/api/personal"
  const deadline = 4102444800000
  const staffDto = {
    idPersonal: 7,
    nombre: "Perfil de campo",
    documento: "DOC-7",
    telefono: null,
    correo: null,
    idioma: "es",
    fechaIngreso: null,
    activo: true,
    idUsuario: 19,
    disponibilidad: [],
    fechaCreacion: "2026-01-01T12:00:00-05:00"
  }

  function setupStaff(authenticated: boolean) {
    const currentAuth = new BehaviorSubject<AuthSession | null>(
      authenticated
        ? AuthSession.create("Caller, not staff", "caller@example.test", null, deadline, 19)
        : null
    )
    const auth = {
      session: signal(currentAuth.value),
      restoreSession: vi.fn(() => of(currentAuth.value)),
      logout: vi.fn()
    }
    TestBed.configureTestingModule({
      providers: [
        provideRouter([...ADMIN_ROUTES, { path: "login", component: LoginDestination }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideFieldOperationsReads(),
        { provide: API_URL, useValue: "http://localhost:8080" },
        { provide: AuthStore, useValue: auth },
        { provide: ObserveAuthSessionUseCase, useValue: { execute: () => currentAuth } }
      ]
    })
    return {
      auth,
      http: TestBed.inject(HttpTestingController),
      store: TestBed.inject(FieldStaffStore)
    }
  }

  function requireStaffRoute() {
    const staff = ADMIN_ROUTES[0].children!.find(route => route.path === "staff")
    // Fail on the missing contract, never on Angular's unrelated no-match exception.
    expect(staff, "Missing lazy /admin/staff route").toBeDefined()
    expect(staff!.loadChildren).toBeTypeOf("function")
    return staff!
  }

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
  afterEach(() => {
    try {
      TestBed.inject(HttpTestingController, null)?.verify()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it("lazily composes staff in the existing shell without replacing IAM, CRM or the temporary redirect", async () => {
    const staff = requireStaffRoute()
    expect(await staff.loadChildren!()).toBe(FIELD_OPERATIONS_ROUTES)
    expect(staff.component).toBeUndefined()
    expect(staff.providers).toBeUndefined()
    const children = ADMIN_ROUTES[0].children!
    expect(children.find(route => route.path === "")?.redirectTo).toBe("users")
    expect(children.find(route => route.path === "users")?.loadChildren).toBeDefined()
    expect(children.find(route => route.path === "customers")?.loadChildren).toBeDefined()
  })

  it.each([
    "/admin/staff",
    "/admin/staff/me?offset=10&limit=5",
    "/admin/staff/7?offset=10&limit=5"
  ])("restores and redirects guest deep link %s without any staff reads or shell", async url => {
    const app = setupStaff(false)
    requireStaffRoute()
    const harness = await RouterTestingHarness.create(url)
    expect(app.auth.restoreSession).toHaveBeenCalled()
    const router = TestBed.inject(Router)
    expect(router.parseUrl(router.url).queryParams["returnUrl"]).toBe(url)
    expect(router.url.split("?")[0]).toBe("/login")
    expect(harness.routeNativeElement?.querySelector("app-admin-sidebar")).toBeNull()
    app.http.expectNone(() => true)
    expect(app.store.selectStaff().result).toBeUndefined()
    expect(app.store.selectStaffById(7).result).toBeUndefined()
    expect(app.store.selectMyStaffProfile().result).toBeUndefined()
  })

  it.each([
    ["/admin/staff", "app-staff-page", api],
    ["/admin/staff/me", "app-staff-detail-page", `${api}/me`],
    ["/admin/staff/7", "app-staff-detail-page", `${api}/7`]
  ])(
    "opens %s in one shared shell with RRHH active and the real root store",
    async (url, selector, endpoint) => {
      const app = setupStaff(true)
      requireStaffRoute()
      const harness = await RouterTestingHarness.create(url)
      await harness.fixture.whenStable()
      const request = app.http.expectOne(r => r.url === endpoint)
      expect(request.request.method).toBe("GET")
      expect(request.request.transferCache).toBe(false)
      if (url === "/admin/staff") {
        expect(request.request.params.get("pagina")).toBe("0")
        expect(request.request.params.get("tamanio")).toBe("20")
        request.flush({ contenido: [], pagina: 0, tamanio: 20, totalElementos: 0, totalPaginas: 0 })
      } else {
        request.flush(staffDto)
      }
      await harness.fixture.whenStable()
      harness.detectChanges()
      const shell = harness.routeNativeElement!
      expect(shell.tagName.toLowerCase()).toBe("app-admin-shell")
      expect(shell.querySelectorAll("app-admin-sidebar")).toHaveLength(1)
      expect(shell.querySelectorAll(".shell-body > header")).toHaveLength(1)
      expect(shell.querySelectorAll(selector)).toHaveLength(1)
      expect(shell.querySelectorAll(`${selector} app-catalog-frame`)).toHaveLength(1)
      expect(harness.routeDebugElement!.injector.get(FieldStaffStore)).toBe(app.store)
      const sidebar = shell.querySelector("app-admin-sidebar")!
      const rrhh = sidebar.querySelector<HTMLAnchorElement>('a[href="/admin/staff"]')
      expect(rrhh, "Missing RRHH anchor").not.toBeNull()
      expect(rrhh!.textContent?.trim()).toBe("RRHH")
      expect(rrhh!.getAttribute("aria-current")).toBe("page")
      for (const path of ["users", "customers"]) {
        expect(
          sidebar.querySelector(`a[href="/admin/${path}"]`)?.hasAttribute("aria-current")
        ).toBe(false)
      }
      app.http.expectNone(() => true)
      if (url === "/admin/staff/me") {
        expect(app.store.selectMyStaffProfile().result?.id).toBe(7)
        // The public authentication ID is 19; it is never treated as a staff ID.
        expect(app.store.selectStaffById(19).result).toBeUndefined()
      }
      rrhh!.click()
      await harness.fixture.whenStable()
      harness.detectChanges()
      expect(TestBed.inject(Router).url).toBe("/admin/staff")
      if (url !== "/admin/staff") {
        app.http
          .expectOne(r => r.url === api)
          .flush({
            contenido: [],
            pagina: 0,
            tamanio: 20,
            totalElementos: 0,
            totalPaginas: 0
          })
        await harness.fixture.whenStable()
        harness.detectChanges()
      }
      expect(shell.querySelectorAll("app-admin-sidebar")).toHaveLength(1)
      expect(shell.querySelector("app-staff-page")).not.toBeNull()
    }
  )
})

describe("Admin users navigation", () => {
  it("lazily composes customers while retaining the users entry redirect", async () => {
    const children = ADMIN_ROUTES[0].children!
    expect(children.find(route => route.path === "")?.redirectTo).toBe("users")
    const customers = children.find(route => route.path === "customers")
    expect(customers?.loadChildren).toBeDefined()
    const { CUSTOMERS_ROUTES } = await import("../../features/customers/customers.routes")
    expect(await customers!.loadChildren!()).toBe(CUSTOMERS_ROUTES)
  })
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
  it("protects customer deep links with the existing returnUrl contract", async () => {
    const auth = setup(false)
    await RouterTestingHarness.create("/admin/customers")
    expect(auth.restoreSession).toHaveBeenCalled()
    expect(TestBed.inject(Router).url).toBe("/login?returnUrl=%2Fadmin%2Fcustomers")
  })

  it("protects the static lead inbox deep link with the existing returnUrl", async () => {
    setup(false)
    await RouterTestingHarness.create("/admin/customers/leads")
    expect(TestBed.inject(Router).url).toBe("/login?returnUrl=%2Fadmin%2Fcustomers%2Fleads")
  })

  it("protects lead detail deep links including independent lead paging context", async () => {
    setup(false)
    await RouterTestingHarness.create("/admin/customers/leads/7?offset=10&limit=5")
    expect(TestBed.inject(Router).url).toBe(
      "/login?returnUrl=%2Fadmin%2Fcustomers%2Fleads%2F7%3Foffset%3D10%26limit%3D5"
    )
  })

  it("protects read-only customer detail deep links including paging context", async () => {
    setup(false)
    await RouterTestingHarness.create("/admin/customers/7?offset=10&limit=5")
    expect(TestBed.inject(Router).url).toBe(
      "/login?returnUrl=%2Fadmin%2Fcustomers%2F7%3Foffset%3D10%26limit%3D5"
    )
  })

  it("opens the lazy customer list inside the unchanged shared shell through CRM", async () => {
    setup(true)
    const execute = vi.fn(() => of(Result.success({ items: [], total: 0, offset: 0, limit: 20 })))
    TestBed.configureTestingModule({
      providers: [{ provide: ListCustomersUseCase, useValue: { execute } }]
    })
    const harness = await RouterTestingHarness.create("/admin/customers")
    await harness.fixture.whenStable()
    harness.detectChanges()
    const element = harness.routeNativeElement!
    expect(element.tagName.toLowerCase()).toBe("app-admin-shell")
    expect(element.querySelectorAll("app-admin-sidebar")).toHaveLength(1)
    const shellHeaders = element.querySelectorAll(".shell-body > header")
    expect(shellHeaders).toHaveLength(1)
    expect(shellHeaders[0].querySelector(".brand-mark")?.textContent).toBe("RM")
    expect(shellHeaders[0].querySelector(".session-controls")?.textContent).toContain(
      "Demo Identity"
    )
    const catalogHeaders = element.querySelectorAll(
      'app-customers-page app-catalog-frame section[aria-labelledby="customers-title"] > header'
    )
    expect(catalogHeaders).toHaveLength(1)
    expect(catalogHeaders[0].querySelector("h1#customers-title")?.textContent?.trim()).toBe(
      "Catálogo de Clientes"
    )
    expect(element.querySelector("app-customers-page")?.textContent).toContain(
      "No hay clientes activos"
    )
    expect(execute).toHaveBeenCalledExactlyOnceWith({ offset: 0, limit: 20 })
    const crm = element.querySelector('a[href="/admin/customers"]')!
    expect(crm.textContent?.trim()).toBe("CRM")
    expect(crm.getAttribute("aria-current")).toBe("page")
    expect(element.querySelector('a[href="/admin/users"]')?.hasAttribute("aria-current")).toBe(
      false
    )
  })

  it("opens the static inbox before customer :id, preserving CRM and switching between real catalog consumers", async () => {
    setup(true)
    const leads = vi.fn(() => of(Result.success({ items: [], total: 0, offset: 0, limit: 20 })))
    const customers = vi.fn(() => of(Result.success({ items: [], total: 0, offset: 0, limit: 20 })))
    const detail = vi.fn()
    TestBed.configureTestingModule({
      providers: [
        { provide: ListLeadsUseCase, useValue: { execute: leads } },
        { provide: ListCustomersUseCase, useValue: { execute: customers } },
        { provide: GetCustomerByIdUseCase, useValue: { execute: detail } }
      ]
    })
    const harness = await RouterTestingHarness.create("/admin/customers/leads")
    await harness.fixture.whenStable()
    harness.detectChanges()
    const element = harness.routeNativeElement!
    expect(element.querySelector("app-leads-page app-crm-catalog-navigation")).not.toBeNull()
    expect(element.querySelector("app-customer-detail-page")).toBeNull()
    expect(detail).not.toHaveBeenCalled()
    expect(leads).toHaveBeenCalledExactlyOnceWith({ offset: 0, limit: 20 })
    const sidebar = element.querySelector("app-admin-sidebar")!
    expect(sidebar.querySelector('a[href="/admin/customers"]')?.textContent?.trim()).toBe("CRM")
    expect(sidebar.querySelectorAll("a")).toHaveLength(3)
    const nav = element.querySelector("app-crm-catalog-navigation")!
    expect(nav.querySelector('[aria-current="page"]')?.textContent?.trim()).toBe("Prospectos")
    nav.querySelector<HTMLAnchorElement>('a[href="/admin/customers"]')!.click()
    await harness.fixture.whenStable()
    harness.detectChanges()
    expect(TestBed.inject(Router).url).toBe("/admin/customers")
    expect(element.querySelector("app-customers-page app-crm-catalog-navigation")).not.toBeNull()
    expect(customers).toHaveBeenCalledExactlyOnceWith({ offset: 0, limit: 20 })
    expect(
      element.querySelector('app-crm-catalog-navigation [aria-current="page"]')?.textContent?.trim()
    ).toBe("Clientes")
  })

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
    const harness = await RouterTestingHarness.create("/admin/users")
    await harness.fixture.whenStable()
    const users = TestBed.inject(UserStore)
    await firstValueFrom(users.readStatistics())
    const statistics = users.selectStatistics()
    expect(statistics.loaded()).toBe(true)
    const button = Array.from(
      harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>("button")
    ).find(item => item.textContent?.includes("Salir"))!
    button.click()
    await harness.fixture.whenStable()
    expect(auth.logout).toHaveBeenCalledOnce()
    expect(auth.session()).toBeNull()
    expect(statistics.result()).toBeUndefined()
    expect(statistics.loaded()).toBe(false)
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
    const shellHeaders = harness.routeNativeElement!.querySelectorAll(".shell-body > header")
    expect(shellHeaders).toHaveLength(1)
    expect(shellHeaders[0].querySelector(".brand-mark")?.textContent).toBe("RM")
    expect(shellHeaders[0].querySelector(".session-controls")?.textContent).toContain(
      "Demo Identity"
    )
    const catalogHeaders = harness.routeNativeElement!.querySelectorAll(
      'app-users-page app-catalog-frame section[aria-labelledby="users-title"] > header'
    )
    expect(catalogHeaders).toHaveLength(1)
    expect(catalogHeaders[0].querySelector("h1#users-title")?.textContent?.trim()).toBe(
      "Catálogo de Usuarios del Sistema"
    )
    expect(harness.routeNativeElement?.querySelectorAll("app-admin-sidebar")).toHaveLength(1)
  })

  it("keeps CRM and RRHH in General and IAM in Administration with three unavailable modules", async () => {
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
    ).toEqual(["Landing", "Cotizaciones", "Programaciones"])
    expect(general.querySelectorAll("a")).toHaveLength(2)
    const crm = general.querySelector('a[href="/admin/customers"]')!
    expect(crm.textContent?.trim()).toBe("CRM")
    expect(crm.querySelector('ng-icon[aria-hidden="true"]')).not.toBeNull()
    expect(administration.querySelectorAll("button")).toHaveLength(0)
    expect(nav.querySelectorAll("a")).toHaveLength(3)
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
    for (const label of ["Landing", "Cotizaciones", "Programaciones"]) {
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
