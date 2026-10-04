import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { firstValueFrom } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { UserStore } from "../../state/user.store"
import { RolesStore } from "../../state/roles.store"
import { UsersDemoInitializer } from "../../demo/users-demo-initializer"
import { USER_REPOSITORY } from "../../../domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "../../../domain/repositories/role.repository"
import { UserInMemorySource } from "../../../infrastructure/source/user-in-memory.source"
import { RoleInMemorySource } from "../../../infrastructure/source/role-in-memory.source"
import { UsersPage } from "./users-page"
import { HlmDialogService } from "@spartan-ng/helm/dialog"

const providers = [
  { provide: USER_REPOSITORY, useExisting: UserInMemorySource },
  { provide: ROLE_REPOSITORY, useExisting: RoleInMemorySource }
]

describe("UsersPage", () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [UsersPage], providers: [...providers, provideRouter([]),
      { provide: AuthStore, useValue: { session: signal({ name: "Actual identity", email: "identity@example.test" }), logout: vi.fn() } }
    ] })
  })
  async function setup() {
    await TestBed.inject(UsersDemoInitializer).initialize()
    const fixture = TestBed.createComponent(UsersPage)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    return { fixture, page: fixture.componentInstance, users: TestBed.inject(UserStore), roles: TestBed.inject(RolesStore), element: fixture.nativeElement as HTMLElement }
  }

  it("renders product copy, actual identity, dynamic counts and disabled future navigation", async () => {
    const { element } = await setup()
    expect(element.textContent).toContain("Actual identity")
    expect(element.textContent).toContain("48")
    expect(element.textContent).toContain("42 activos")
    expect(element.textContent).toContain("6 inactivos")
    expect(element.textContent).toContain("CORE BACKOFFICE")
    expect(element.textContent).toContain("Gestiona estados, roles")
    const accessibleCopy = Array.from(element.querySelectorAll("[aria-label], [title], caption, [id$='-help']"))
      .map(node => `${node.textContent} ${node.getAttribute("aria-label") ?? ""} ${node.getAttribute("title") ?? ""}`).join(" ")
    expect(`${element.textContent} ${accessibleCopy}`).not.toMatch(/demo|demostración|en memoria|fictici|sin backend|no implementad|RF02|HU02|P03|M02/i)
    expect(element.querySelector("#credentials-help")?.textContent).toBe("Credenciales: No disponible.")
    const credentials = element.querySelectorAll<HTMLButtonElement>('button[aria-describedby="credentials-help"]')
    expect(credentials).toHaveLength(10)
    expect(Array.from(credentials).every(button => button.disabled)).toBe(true)
    expect(element.textContent).not.toContain("Super Administrador")
    const tabs = element.querySelectorAll<HTMLButtonElement>("[data-future-tab]")
    expect(tabs).toHaveLength(3)
    expect(Array.from(tabs).every(tab => tab.disabled && tab.getAttribute("aria-describedby") === "future-tabs-help")).toBe(true)
    expect(element.querySelector("#future-tabs-help")?.textContent).toContain("Próximamente")
    expect(element.textContent).toContain("Nunca accedió")
  })

  it("uses product-facing success feedback for user and role operations", async () => {
    const { page, fixture, element } = await setup()
    const open = vi.spyOn(TestBed.inject(HlmDialogService), "open").mockReturnValue(undefined as never)
    page.editUser()
    const saved = open.mock.calls.at(-1)![1]!.context as { onSaved: () => void }
    saved.onSaved()
    fixture.detectChanges()
    expect(element.querySelector('[role="status"]')?.textContent).toBe("Usuario guardado.")
    page.deleteUser(page.visibleUsers()[0])
    const deleted = open.mock.calls.at(-1)![1]!.context as { onDeleted: () => void }
    deleted.onDeleted()
    fixture.detectChanges()
    expect(element.textContent).toContain("Usuario Carlos Mendoza eliminado.")
    page.manageRoles()
    const changed = open.mock.calls.at(-1)![1]!.context as { onChanged: () => void }
    changed.onChanged()
    fixture.detectChanges()
    expect(element.textContent).toContain("Catálogo de roles actualizado.")
    expect(element.textContent).not.toMatch(/demo|demostración|en memoria|fictici/i)
  })

  it("pairs decorative reference tones with actual roles and explicit status labels on desktop and mobile", async () => {
    const { element } = await setup()
    const rows = Array.from(element.querySelectorAll("tbody tr"))
    expect(rows.map(row => row.querySelector("[data-avatar-tone]")?.getAttribute("data-avatar-tone"))).toEqual(["navy", "coral", "green", "amber", "neutral"])
    expect(rows.map(row => row.querySelector("[data-role-tone]")?.getAttribute("data-role-tone"))).toEqual(["purple", "blue", "green", "amber", "green"])
    for (const surface of [element.querySelector("tbody")!, element.querySelector('ul[aria-label="Usuarios"]')!]) {
      expect(surface.querySelectorAll('[data-status="active"]')).toHaveLength(4)
      expect(surface.querySelector('[data-status="active"]')?.textContent).toContain("Activo")
      expect(surface.querySelector('[data-status="inactive"]')?.textContent).toContain("Inactivo")
      expect(surface.querySelectorAll("[data-role-tone]")).toHaveLength(5)
    }
    expect(element.querySelectorAll(".kpi-tile")).toHaveLength(4)
    expect(element.querySelector("#new-user ng-icon")?.classList.contains("primary-plus")).toBe(true)
  })

  it("keeps fallback tones deterministic and independent of record IDs and catalog ordering", async () => {
    const { page, roles } = await setup()
    const presentation = page
    const sample = { ...page.visibleUsers()[0], name: "Nueva Persona", email: "new@example.test", id: 900 }
    const avatar = presentation.avatarTone(sample)
    expect(["navy", "coral", "green", "amber", "neutral"]).toContain(avatar)
    expect(presentation.avatarTone({ ...sample, id: 901 })).toBe(avatar)
    const result = await firstValueFrom(roles.createRole({ name: "Rol dinámico", description: "", isActive: true }))
    expect(result.success).toBe(true)
    const role = roles.roles().find(item => item.name === "Rol dinámico")!
    const assigned = { ...sample, roleId: role.id }
    const tone = presentation.roleTone(assigned)
    expect(["purple", "blue", "green", "amber"]).toContain(tone)
    const other = await firstValueFrom(roles.createRole({ name: role.name, description: "Otro", isActive: true }))
    expect(other.success).toBe(true)
    expect(presentation.roleTone({ ...assigned, roleId: roles.roles().at(-1)!.id })).toBe(tone)
    expect(presentation.roleTone({ ...assigned, roleId: -1 })).toBe("neutral")
  })

  it("declares a scoped navy primary and keeps the coral tab token independent", async () => {
    const { element } = await setup()
    const hostScope = element.getAttributeNames().find(name => name.startsWith("_nghost-"))!
    const css = Array.from(document.querySelectorAll("style")).map(style => style.textContent ?? "").find(text => text.includes(`[${hostScope}]`))!
    expect(css).toMatch(/--primary:\s*var\(--navy\)/)
    expect(css).toMatch(/--primary-foreground:\s*var\(--paper\)/)
    expect(css).toMatch(/--users-tab-accent:\s*var\(--coral\)/)
    expect(css).toContain("3px solid var(--users-tab-accent)")
    expect(css).toContain('--users-pink-soft')
    expect(element.querySelector("#new-user")?.classList.contains("bg-primary")).toBe(true)
    expect(element.querySelector("#new-user")?.classList.contains("focus-visible:ring-3")).toBe(true)
  })

  it("searches names and emails, filters actual role/status and resets pagination", async () => {
    const { page, roles } = await setup()
    page.goToPage(8)
    page.setSearch("carlos")
    expect(page.currentPage()).toBe(1)
    expect(page.filteredUsers().map(user => user.name)).toEqual(["Carlos Mendoza"])
    page.setSearch("persona.48@")
    expect(page.filteredUsers()).toHaveLength(1)
    page.setSearch("")
    page.setRoleFilter(String(roles.roles()[2].id))
    expect(page.filteredUsers().every(user => user.roleId === roles.roles()[2].id)).toBe(true)
    page.setStatusFilter("inactive")
    expect(page.filteredUsers().every(user => !user.isActive)).toBe(true)
    page.clearFilters()
    expect(page.filteredUsers()).toHaveLength(48)
  })

  it("clamps the current page when last-page users are deleted", async () => {
    const { page, users } = await setup()
    page.goToPage(10)
    expect(page.visibleUsers()).toHaveLength(3)
    for (const user of [...page.visibleUsers()]) await firstValueFrom(users.deleteUserById(user.id))
    expect(page.currentPage()).toBe(9)
    expect(page.visibleUsers()).toHaveLength(5)
  })

  it("shows empty filtered results and offers a reset action", async () => {
    const { page, fixture, element } = await setup()
    page.setSearch("no-such-user")
    fixture.detectChanges()
    expect(element.textContent).toContain("Sin resultados")
    const reset = element.querySelector<HTMLButtonElement>("[data-reset-filters]")!
    reset.click()
    fixture.detectChanges()
    expect(page.filteredUsers()).toHaveLength(48)
  })

  it("displays initialization failure with retry and a loading state", async () => {
    const initializer = TestBed.inject(UsersDemoInitializer)
    let release: (() => void) | undefined
    vi.spyOn(initializer, "initialize").mockRejectedValueOnce(new Error("offline")).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
    const fixture = TestBed.createComponent(UsersPage)
    fixture.detectChanges()
    await fixture.whenStable()
    fixture.detectChanges()
    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain("No pudimos cargar")
    const retry = element.querySelector<HTMLButtonElement>("[data-retry]")!
    retry.click()
    fixture.detectChanges()
    expect(element.textContent).toContain("Cargando catálogo")
    release?.()
    await fixture.whenStable()
    fixture.detectChanges()
    expect(element.textContent).toContain("Aún no hay usuarios")
  })
})
