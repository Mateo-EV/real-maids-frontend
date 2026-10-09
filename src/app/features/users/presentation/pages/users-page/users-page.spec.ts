/// <reference types="node" />
import { readFileSync } from "node:fs"
import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { provideRouter } from "@angular/router"
import { firstValueFrom, of, Subject } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserError } from "../../../domain/errors/user.error"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { UserStore } from "../../state/user.store"
import { RolesStore } from "../../state/roles.store"
import { USER_REPOSITORY } from "../../../domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "../../../domain/repositories/role.repository"
import { UserInMemorySource } from "../../../infrastructure/source/user-in-memory.source"
import { RoleInMemorySource } from "../../../infrastructure/source/role-in-memory.source"
import { UsersPage } from "./users-page"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import {
  UserStatusContext,
  UserStatusDialog
} from "../../components/user-status-dialog/user-status-dialog"

const providers = [
  { provide: USER_REPOSITORY, useExisting: UserInMemorySource },
  { provide: ROLE_REPOSITORY, useExisting: RoleInMemorySource }
]

async function flush<T>(pending: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return pending
}

describe("UsersPage", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [UsersPage],
      providers: [
        ...providers,
        provideRouter([]),
        {
          provide: AuthStore,
          useValue: {
            session: signal({ name: "Actual identity", email: "identity@example.test" }),
            logout: vi.fn()
          }
        }
      ]
    })
  })
  async function setup() {
    const fixture = TestBed.createComponent(UsersPage)
    fixture.detectChanges()
    await flush(fixture.whenStable())
    fixture.detectChanges()
    return {
      fixture,
      page: fixture.componentInstance,
      users: TestBed.inject(UserStore),
      roles: TestBed.inject(RolesStore),
      element: fixture.nativeElement as HTMLElement
    }
  }

  it("starts concurrent catalog queries and cancels both on destruction without mutations", async () => {
    const roles = TestBed.inject(RolesStore),
      users = TestBed.inject(UserStore)
    const loadUsers = vi.spyOn(users, "loadUsers")
    const createRole = vi.spyOn(roles, "createRole")
    const fixture = TestBed.createComponent(UsersPage)
    fixture.detectChanges()
    const page = fixture.componentInstance
    expect(roles.loading()).toBe(true)
    expect(users.loading()).toBe(true)
    expect(loadUsers).toHaveBeenCalledOnce()
    fixture.destroy()
    await vi.runAllTimersAsync()
    expect(roles.loading()).toBe(false)
    expect(users.loading()).toBe(false)
    expect(createRole).not.toHaveBeenCalled()
    expect(roles.roles()).toEqual([])
    expect(users.users()).toEqual([])
    expect(page.loadError()).toBe(false)
  })

  it("does not set page feedback after a cancelled query", async () => {
    const response = new Subject<ReturnType<typeof Result.failure<UserError>>>()
    vi.spyOn(TestBed.inject(UserStore), "loadUsers").mockReturnValue(response)
    const fixture = TestBed.createComponent(UsersPage)
    fixture.detectChanges()
    const page = fixture.componentInstance
    const setError = vi.spyOn(page.loadError, "set")
    fixture.destroy()
    expect(response.observed).toBe(false)
    response.next(Result.failure(new UserError("UNEXPECTED")))
    response.complete()
    await Promise.resolve()
    expect(setError).not.toHaveBeenCalled()
  })

  it("renders an empty catalog without creating records at page entry", async () => {
    vi.spyOn(TestBed.inject(UserInMemorySource), "getUsers").mockReturnValue(of(Result.success([])))
    const create = vi.spyOn(TestBed.inject(UserStore), "createUser")
    const { element, page } = await setup()
    expect(element.textContent).toContain("Aún no hay usuarios")
    expect(page.loadError()).toBe(false)
    expect(create).not.toHaveBeenCalled()
  })

  it("keeps icon-only actions named per record on desktop and mobile without role management", async () => {
    const { page, element } = await setup()
    expect(element.textContent).not.toContain("Gestionar roles")
    for (const surface of [
      element.querySelector("tbody")!,
      element.querySelector('ul[aria-label="Usuarios"]')!
    ]) {
      for (const user of page.visibleUsers()) {
        for (const action of [
          "Editar usuario",
          "Eliminar usuario",
          user.isActive ? "Desactivar usuario" : "Activar usuario"
        ]) {
          const button = surface.querySelector<HTMLButtonElement>(
            `button[aria-label="${action} ${user.name}"]`
          )!
          expect(button).not.toBeNull()
          expect(button.textContent?.trim()).toBe("")
          expect(button.querySelector("ng-icon")?.getAttribute("aria-hidden")).toBe("true")
          expect(button.disabled).toBe(false)
        }
      }
    }
  })

  it("retains seven scoped table columns, mobile records and labelled filter controls", async () => {
    const { element, page } = await setup()
    const headings = Array.from(element.querySelectorAll("thead th"))
    expect(headings).toHaveLength(7)
    expect(headings.every(heading => heading.getAttribute("scope") === "col")).toBe(true)
    expect(element.querySelectorAll("tbody tr")).toHaveLength(page.visibleUsers().length)
    expect(element.querySelectorAll('ul[aria-label="Usuarios"] > li')).toHaveLength(
      page.visibleUsers().length
    )
    for (const id of ["user-search", "role-filter", "status-filter"]) {
      expect(element.querySelector(`label[for="${id}"]`)?.textContent?.trim()).toBeTruthy()
      expect(element.querySelector(`#${id}`)).not.toBeNull()
    }
    expect(element.querySelector("main h1#users-title")).not.toBeNull()
  })

  it("ignores dialog callbacks after the owning page is destroyed", async () => {
    const { page, fixture } = await setup()
    const success = vi.spyOn(TestBed.inject(HotToastService), "success")
    const open = vi
      .spyOn(TestBed.inject(HlmDialogService), "open")
      .mockReturnValue(undefined as never)
    page.editUser()
    const saved = open.mock.calls.at(-1)![1]!.context as { onSaved: () => void }
    page.deleteUser(page.visibleUsers()[0])
    const deleted = open.mock.calls.at(-1)![1]!.context as { onDeleted: () => void }
    page.changeUserStatus(page.visibleUsers()[0])
    const changed = open.mock.calls.at(-1)![1]!.context as UserStatusContext
    fixture.destroy()
    changed.onChanged()
    saved.onSaved()
    expect(success).not.toHaveBeenCalled()
    deleted.onDeleted()
    expect(success).not.toHaveBeenCalled()
  })

  it("wires both status directions on desktop/mobile to confirmation without mutation or early toast", async () => {
    const { page, users, element } = await setup()
    const update = vi.spyOn(users, "updateUserById")
    const success = vi.spyOn(TestBed.inject(HotToastService), "success")
    const open = vi
      .spyOn(TestBed.inject(HlmDialogService), "open")
      .mockReturnValue(undefined as never)
    for (const surface of [
      element.querySelector("tbody")!,
      element.querySelector('ul[aria-label="Usuarios"]')!
    ]) {
      for (const user of [page.visibleUsers()[0], page.visibleUsers()[4]]) {
        const verb = user.isActive ? "Desactivar" : "Activar"
        const button = surface.querySelector<HTMLButtonElement>(
          `button[aria-label="${verb} usuario ${user.name}"]`
        )!
        expect(button.querySelector('ng-icon[name="lucidePower"]')).not.toBeNull()
        button.click()
        expect(open.mock.calls.at(-1)![0]).toBe(UserStatusDialog)
        const options = open.mock.calls.at(-1)![1]!
        expect(options.disableClose).toBe(true)
        expect(options.showCloseButton).toBe(false)
        const context = options.context as UserStatusContext
        expect(context.user).toBe(user)
        expect(update).not.toHaveBeenCalled()
        expect(success).not.toHaveBeenCalled()
      }
    }
    const context = open.mock.calls.at(-1)![1]!.context as UserStatusContext
    page.setSearch("persona")
    page.setRoleFilter("3")
    page.setStatusFilter("inactive")
    const filters = [page.search(), page.roleFilter(), page.statusFilter(), page.currentPage()]
    context.onChanged()
    expect(success).toHaveBeenCalledExactlyOnceWith(`Usuario ${context.user.name} activado`)
    expect([page.search(), page.roleFilter(), page.statusFilter(), page.currentPage()]).toEqual(
      filters
    )
    page.changeUserStatus(users.users()[0])
    ;(open.mock.calls.at(-1)![1]!.context as UserStatusContext).onChanged()
    expect(success).toHaveBeenLastCalledWith(`Usuario ${users.users()[0].name} desactivado`)
  })

  it("renders catalog copy and counts without duplicating shell identity or navigation", async () => {
    const { element } = await setup()
    expect(element.textContent).not.toContain("Actual identity")
    expect(element.querySelector("header")).toBeNull()
    expect(element.querySelector("app-admin-sidebar")).toBeNull()
    expect(element.textContent).toContain("48")
    expect(element.textContent).toContain("42 activos")
    expect(element.textContent).toContain("6 inactivos")
    expect(element.textContent).not.toContain("CORE BACKOFFICE")
    expect(element.textContent).toContain("Gestiona estados, roles")
    const accessibleCopy = Array.from(
      element.querySelectorAll("[aria-label], [title], caption, [id$='-help']")
    )
      .map(
        node =>
          `${node.textContent} ${node.getAttribute("aria-label") ?? ""} ${node.getAttribute("title") ?? ""}`
      )
      .join(" ")
    expect(`${element.textContent} ${accessibleCopy}`).not.toMatch(
      /demo|demostración|en memoria|fictici|sin backend|no implementad|RF02|HU02|P03|M02/i
    )
    expect(element.querySelector("#credentials-help")).toBeNull()
    const credentials = element.querySelectorAll<HTMLButtonElement>(
      'button[aria-describedby="credentials-help"]'
    )
    expect(credentials).toHaveLength(0)
    expect(element.querySelector('ng-icon[name="lucideKeyRound"]')).toBeNull()
    expect(element.textContent).not.toContain("Super Administrador")
    const tabs = element.querySelectorAll<HTMLButtonElement>("[data-future-tab]")
    expect(tabs).toHaveLength(3)
    expect(
      Array.from(tabs).every(
        tab => tab.disabled && tab.getAttribute("aria-describedby") === "future-tabs-help"
      )
    ).toBe(true)
    expect(element.querySelector("#future-tabs-help")).toBeNull()
    expect(element.textContent).toContain("Nunca accedió")
  })

  it("uses product-facing success toasts only after successful user operation callbacks", async () => {
    const { page, fixture, element } = await setup()
    const success = vi.spyOn(TestBed.inject(HotToastService), "success")
    const open = vi
      .spyOn(TestBed.inject(HlmDialogService), "open")
      .mockReturnValue(undefined as never)
    page.editUser()
    const saved = open.mock.calls.at(-1)![1]!.context as { onSaved: () => void }
    expect(success).not.toHaveBeenCalled()
    saved.onSaved()
    fixture.detectChanges()
    expect(success).toHaveBeenCalledExactlyOnceWith("Usuario guardado")
    page.deleteUser(page.visibleUsers()[0])
    const deleted = open.mock.calls.at(-1)![1]!.context as { onDeleted: () => void }
    expect(success).toHaveBeenCalledTimes(1)
    deleted.onDeleted()
    fixture.detectChanges()
    expect(success).toHaveBeenCalledTimes(2)
    expect(success).toHaveBeenLastCalledWith("Usuario Carlos Mendoza eliminado")
    expect(element.textContent).not.toMatch(/demo|demostración|en memoria|fictici/i)
  })

  it("pairs decorative reference tones with actual roles and explicit status labels on desktop and mobile", async () => {
    const { element } = await setup()
    const rows = Array.from(element.querySelectorAll("tbody tr"))
    expect(
      rows.map(row => row.querySelector("[data-avatar-tone]")?.getAttribute("data-avatar-tone"))
    ).toEqual(["navy", "coral", "green", "amber", "neutral"])
    expect(
      rows.map(row => row.querySelector("[data-role-tone]")?.getAttribute("data-role-tone"))
    ).toEqual(["purple", "blue", "green", "amber", "green"])
    for (const surface of [
      element.querySelector("tbody")!,
      element.querySelector('ul[aria-label="Usuarios"]')!
    ]) {
      expect(surface.querySelectorAll('[data-status="active"]')).toHaveLength(4)
      expect(surface.querySelector('[data-status="active"]')?.textContent).toContain("Activo")
      expect(surface.querySelector('[data-status="inactive"]')?.textContent).toContain("Inactivo")
      expect(surface.querySelectorAll("[data-role-tone]")).toHaveLength(5)
    }
    expect(element.querySelectorAll(".kpi-tile")).toHaveLength(4)
    expect(element.querySelector("#new-user ng-icon")?.classList.contains("primary-plus")).toBe(
      true
    )
  })

  it("keeps fallback tones deterministic and independent of record IDs and catalog ordering", async () => {
    const { page, roles } = await setup()
    const presentation = page
    const sample = {
      ...page.visibleUsers()[0],
      name: "Nueva Persona",
      email: "new@example.test",
      id: 900
    }
    const avatar = presentation.avatarTone(sample)
    expect(["navy", "coral", "green", "amber", "neutral"]).toContain(avatar)
    expect(presentation.avatarTone({ ...sample, id: 901 })).toBe(avatar)
    const result = await flush(
      firstValueFrom(roles.createRole({ name: "Rol dinámico", description: "", isActive: true }))
    )
    expect(result.success).toBe(true)
    const role = roles.roles().find(item => item.name === "Rol dinámico")!
    const assigned = { ...sample, roleId: role.id }
    const tone = presentation.roleTone(assigned)
    expect(["purple", "blue", "green", "amber"]).toContain(tone)
    const other = await flush(
      firstValueFrom(roles.createRole({ name: role.name, description: "Otro", isActive: true }))
    )
    expect(other.success).toBe(true)
    expect(presentation.roleTone({ ...assigned, roleId: roles.roles().at(-1)!.id })).toBe(tone)
    expect(presentation.roleTone({ ...assigned, roleId: -1 })).toBe("neutral")
  })

  // Inspect authored tokens: jsdom does not measure rendered OKLCH contrast or hover.
  it.each([":root", ":root.dark"])(
    "defines global navy primary with readable foreground and gold accent in %s",
    selector => {
      const globalCss = readFileSync("src/styles.css", "utf8")
      const block = globalCss.split(`${selector} {`)[1]?.split("}")[0] ?? ""
      expect(block).toMatch(/--primary:\s*var\(--navy\);/)
      expect(block).toMatch(/--primary-foreground:\s*var\(--paper\);/)
      expect(block).toMatch(/--accent:\s*var\(--gold\);/)
      expect(block).toMatch(/--accent-foreground:\s*var\(--navy-deep\);/)
    }
  )

  it("centralizes enabled default action hover without changing outline or destructive variants", () => {
    const globalCss = readFileSync("src/styles.css", "utf8")
    expect(globalCss).toMatch(
      /@layer utilities\s*\{\s*\[data-slot="button"\]\.bg-primary:hover:not\(\[data-disabled\]\)\s*\{\s*background-color:\s*var\(--navy-deep\);/
    )
    expect(globalCss).not.toMatch(
      /\[data-slot="button"\][^{]*\.(?:bg-destructive|bg-background)[^{]*\{/
    )
  })

  it("inherits global primary without feature CTA overrides and keeps coral tabs independent", async () => {
    const { element } = await setup()
    const hostScope = element.getAttributeNames().find(name => name.startsWith("_nghost-"))!
    const css = Array.from(document.querySelectorAll("style"))
      .map(style => style.textContent ?? "")
      .find(text => text.includes(`[${hostScope}]`))!
    expect(css).not.toMatch(/--primary(?:-foreground)?:/)
    expect(css).not.toMatch(/\[hlmBtn\].*\.bg-primary.*:hover/)
    expect(css).toMatch(/--users-tab-accent:\s*var\(--coral\)/)
    expect(css).toContain("3px solid var(--users-tab-accent)")
    expect(css).toContain("--users-pink-soft")
    expect(element.querySelector("#new-user")?.classList.contains("bg-primary")).toBe(true)
    expect(element.querySelector("#new-user")?.classList.contains("text-primary-foreground")).toBe(
      true
    )
    expect(element.querySelector("#new-user")?.classList.contains("focus-visible:ring-3")).toBe(
      true
    )
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
    page.goToPage(8)
    page.setRoleFilter(String(roles.roles()[2].id))
    expect(page.currentPage()).toBe(1)
    expect(page.filteredUsers().every(user => user.roleId === roles.roles()[2].id)).toBe(true)
    page.goToPage(2)
    page.setStatusFilter("inactive")
    expect(page.currentPage()).toBe(1)
    expect(page.filteredUsers().every(user => !user.isActive)).toBe(true)
    page.clearFilters()
    expect(page.filteredUsers()).toHaveLength(48)
  })

  it("connects bounded shared navigation to users slicing and filter resets", async () => {
    const { page, fixture, element } = await setup()
    const nav = () =>
      element.querySelector('app-table-pagination nav[aria-label="Paginación de usuarios"]')!
    const select = (number: number) => {
      nav().querySelector<HTMLButtonElement>(`button[aria-label="Página ${number}"]`)!.click()
      fixture.detectChanges()
    }
    expect(nav()).not.toBeNull()
    expect(
      nav().querySelectorAll(
        'button[aria-label^="Página "]:not([aria-label="Página anterior"]):not([aria-label="Página siguiente"])'
      )
    ).toHaveLength(4)
    select(10)
    expect(page.currentPage()).toBe(10)
    expect(page.visibleUsers()).toHaveLength(3)
    expect(nav().querySelector('button[aria-current="page"]')?.textContent?.trim()).toBe("10")
    nav().querySelector<HTMLButtonElement>('button[aria-label="Página anterior"]')!.click()
    fixture.detectChanges()
    expect(page.currentPage()).toBe(9)
    expect(page.visibleUsers()).toHaveLength(5)
    nav().querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')!.click()
    fixture.detectChanges()
    expect(page.currentPage()).toBe(10)
    page.setSearch("persona.48@")
    fixture.detectChanges()
    expect(page.currentPage()).toBe(1)
    expect(
      nav().querySelectorAll(
        'button[aria-label^="Página "]:not([aria-label="Página anterior"]):not([aria-label="Página siguiente"])'
      )
    ).toHaveLength(1)
    expect(
      nav().querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')?.disabled
    ).toBe(true)
  })

  it("clamps the current page when last-page users are deleted", async () => {
    const { page, users, fixture, element } = await setup()
    page.goToPage(10)
    expect(page.visibleUsers()).toHaveLength(3)
    for (const user of [...page.visibleUsers()])
      await flush(firstValueFrom(users.deleteUserById(user.id)))
    expect(page.currentPage()).toBe(9)
    expect(page.visibleUsers()).toHaveLength(5)
    fixture.detectChanges()
    const nav = element.querySelector('nav[aria-label="Paginación de usuarios"]')!
    expect(nav.querySelector('button[aria-current="page"]')?.textContent?.trim()).toBe("9")
    expect(
      nav.querySelector<HTMLButtonElement>('button[aria-label="Página siguiente"]')?.disabled
    ).toBe(true)
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

  it("displays query failure with retry and a loading state", async () => {
    const users = TestBed.inject(UserStore)
    const load = vi.spyOn(users, "loadUsers")
    load.mockReturnValueOnce(of(Result.failure(new UserError("UNEXPECTED"))))
    const fixture = TestBed.createComponent(UsersPage)
    fixture.detectChanges()
    await flush(fixture.whenStable())
    fixture.detectChanges()
    const element = fixture.nativeElement as HTMLElement
    expect(element.textContent).toContain("No pudimos cargar")
    const retry = element.querySelector<HTMLButtonElement>("[data-retry]")!
    retry.click()
    fixture.detectChanges()
    expect(element.textContent).toContain("Cargando catálogo")
    await flush(fixture.whenStable())
    fixture.detectChanges()
    expect(element.textContent).toContain("Carlos Mendoza")
    expect(load).toHaveBeenCalledTimes(2)
  })
})
