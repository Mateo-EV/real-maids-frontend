import { Component, getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { describe, expect, it, beforeEach, vi } from "vitest"
import { Subject } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Role } from "../../../domain/entities/role.entity"
import { RoleError } from "../../../domain/errors/role.error"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { USER_REPOSITORY } from "../../../domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "../../../domain/repositories/role.repository"
import { UserInMemorySource } from "../../../infrastructure/source/user-in-memory.source"
import { RoleInMemorySource } from "../../../infrastructure/source/role-in-memory.source"
import { RolesStore } from "../../state/roles.store"
import { UserStore } from "../../state/user.store"
import { UsersDemoInitializer } from "../../demo/users-demo-initializer"
import { RoleCatalog, RoleCatalogContext } from "./role-catalog"

@Component({ template: "" })
class TestHost {}

describe("RoleCatalog", () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [TestHost], providers: [
    { provide: USER_REPOSITORY, useExisting: UserInMemorySource }, { provide: ROLE_REPOSITORY, useExisting: RoleInMemorySource }
  ] }))
  async function setup() {
    await TestBed.inject(UsersDemoInitializer).initialize()
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    const changed = vi.fn()
    const ref = TestBed.inject(HlmDialogService).open<void, RoleCatalogContext>(RoleCatalog, { context: { onChanged: changed }, showCloseButton: false })
    await fixture.whenStable()
    const element = document.querySelector<HTMLElement>("app-role-catalog")!
    return { catalog: getDebugNode(element)!.injector.get(RoleCatalog), ref, fixture, element, changed, roles: TestBed.inject(RolesStore), users: TestBed.inject(UserStore) }
  }
  it("supplies navy primary tokens on its own overlay host without depending on UsersPage", async () => {
    const { element, ref } = await setup()
    expect(element.closest("app-users-page")).toBeNull()
    const hostScope = element.getAttributeNames().find(name => name.startsWith("_nghost-"))!
    const css = Array.from(document.querySelectorAll("style")).map(style => style.textContent ?? "").find(text => text.includes(`[${hostScope}]`))!
    expect(css).toMatch(/--primary:\s*var\(--navy\)/)
    expect(css).toMatch(/--primary-foreground:\s*var\(--paper\)/)
    expect(element.querySelector('button[type="submit"]')?.classList.contains("bg-primary")).toBe(true)
    ref.forceClose()
  })

  it("validates, creates, edits, and discards role drafts without a permission matrix", async () => {
    const { catalog, roles, ref, changed, element } = await setup()
    expect(element.textContent).toContain("Catálogo de roles del sistema.")
    expect(element.textContent).not.toMatch(/demo|demostración|en memoria|fictici|de ejemplo|sin ACL|concede permisos/i)
    const count = roles.roles().length
    await catalog.save()
    expect(roles.roles()).toHaveLength(count)
    catalog.model.set({ name: "  Nuevo rol  ", description: "Descripción", isActive: true })
    await catalog.save()
    const role = roles.roles().find(item => item.name === "Nuevo rol")!
    expect(changed).toHaveBeenCalledOnce()
    expect(catalog.success()).toBe("Rol guardado.")
    TestBed.tick()
    expect(element.querySelector('[role="status"]')?.textContent).toBe("Rol guardado.")
    catalog.edit(role)
    catalog.model.update(model => ({ ...model, name: "Renombrado", isActive: false }))
    await catalog.save()
    expect(roles.roles().find(item => item.id === role.id)?.name).toBe("Renombrado")
    catalog.edit(roles.roles()[0])
    catalog.model.update(model => ({ ...model, name: "Unsaved" }))
    catalog.discard()
    expect(catalog.model().name).toBe("")
    expect(roles.roles()[0].name).not.toBe("Unsaved")
    expect(element.textContent).toContain("Gestionar roles")
    ref.forceClose()
  })
  it("deactivates while preserving assignments and reports ROLE_IN_USE on confirmed deletion", async () => {
    const { catalog, roles, users, ref, fixture, element } = await setup()
    const role = roles.roles()[0]
    const assignments = users.users().map(user => user.roleId)
    await catalog.toggle(role)
    expect(roles.roles()[0].isActive).toBe(false)
    expect(users.users().map(user => user.roleId)).toEqual(assignments)
    catalog.requestDelete(role)
    TestBed.tick()
    expect(element.textContent).toContain(`¿Eliminar el rol ${role.name}`)
    await catalog.confirmDelete()
    await fixture.whenStable()
    expect(catalog.error()).toContain("Este rol está asignado")
    expect(catalog.error()).not.toContain("ROLE_IN_USE")
    expect(element.querySelector('[role="alert"]')?.textContent).not.toMatch(/demo|demostración|en memoria|fictici|ROLE_IN_USE/i)
    expect(roles.roles().some(item => item.id === role.id)).toBe(true)
    catalog.cancelDelete()
    expect(catalog.deleteTarget()).toBeNull()
    ref.forceClose()
  })
  it("prevents duplicate role submissions and closing/discarding while pending, then reports failure", async () => {
    const { catalog, roles, ref, changed } = await setup()
    const response = new Subject<Result<Role, RoleError>>()
    const create = vi.spyOn(roles, "createRole").mockReturnValue(response)
    const close = vi.spyOn(ref, "close")
    catalog.model.set({ name: "Pending", description: "", isActive: true })
    const pending = catalog.save()
    await Promise.resolve()
    expect(catalog.busy()).toBe(true)
    await catalog.save()
    catalog.close()
    catalog.discard()
    expect(close).not.toHaveBeenCalled()
    expect(create).toHaveBeenCalledOnce()
    expect(catalog.model().name).toBe("Pending")
    response.next(Result.failure(new RoleError("UNEXPECTED"))); response.complete()
    await pending
    expect(catalog.error()).toContain("No pudimos completar")
    expect(changed).not.toHaveBeenCalled()
    expect(catalog.busy()).toBe(false)
    ref.forceClose()
  })

  it("deletes an unassigned role only after confirmation", async () => {
    const { catalog, roles, ref, element } = await setup()
    catalog.model.set({ name: "Unused", description: "", isActive: true })
    await catalog.save()
    const target = roles.roles().find(role => role.name === "Unused")!
    catalog.requestDelete(target)
    expect(roles.roles().some(role => role.id === target.id)).toBe(true)
    await catalog.confirmDelete()
    expect(roles.roles().some(role => role.id === target.id)).toBe(false)
    expect(catalog.success()).toBe("Rol eliminado.")
    TestBed.tick()
    expect(element.querySelector('[role="status"]')?.textContent).toBe("Rol eliminado.")
    ref.forceClose()
  })
})
