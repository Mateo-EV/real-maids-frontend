import { Component, getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of, Subject } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { Result } from "@/app/shared/utils/result"
import { Lang, User } from "../../../domain/entities/user.entity"
import { UserError } from "../../../domain/errors/user.error"
import { USER_REPOSITORY } from "../../../domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "../../../domain/repositories/role.repository"
import { UserInMemorySource } from "../../../infrastructure/source/user-in-memory.source"
import { RoleInMemorySource } from "../../../infrastructure/source/role-in-memory.source"
import { UserStore } from "../../state/user.store"
import { RolesStore } from "../../state/roles.store"
import { UsersDemoInitializer } from "../../demo/users-demo-initializer"
import { UserEditor, UserEditorContext } from "./user-editor"

@Component({ template: "" })
class TestHost {}

describe("UserEditor Signal Forms", () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [TestHost], providers: [
    { provide: USER_REPOSITORY, useExisting: UserInMemorySource },
    { provide: ROLE_REPOSITORY, useExisting: RoleInMemorySource }
  ] }))

  async function setup(user: User | null = null) {
    await TestBed.inject(UsersDemoInitializer).initialize()
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    const saved = vi.fn()
    const ref = TestBed.inject(HlmDialogService).open<void, UserEditorContext>(UserEditor, { context: { user, onSaved: saved }, showCloseButton: false })
    await fixture.whenStable()
    const element = document.querySelector<HTMLElement>("app-user-editor")!
    const editor = getDebugNode(element)!.injector.get(UserEditor)
    return { fixture, editor, saved, ref, element, users: TestBed.inject(UserStore), roles: TestBed.inject(RolesStore) }
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

  it("rejects missing name/email/role, malformed email and invalid numeric age with visible errors", async () => {
    const { editor, users, fixture, element, ref } = await setup()
    const create = vi.spyOn(users, "createUser")
    await editor.save()
    await fixture.whenStable()
    expect(create).not.toHaveBeenCalled()
    expect(editor.userForm.name().touched()).toBe(true)
    expect(element.textContent).toContain("Ingresa el nombre")
    const roleSelect = element.querySelector<HTMLSelectElement>("#user-role")!
    const describedBy = roleSelect.getAttribute("aria-describedby") ?? ""
    const roleError = element.querySelector<HTMLElement>("hlm-native-select + p + hlm-field-error")
    expect(describedBy.split(" ")).toContain(roleError?.id)
    editor.model.set({ name: "   ", age: -1, email: "invalid", roleId: "", lang: Lang.ES, isActive: true })
    expect(editor.userForm().valid()).toBe(false)
    expect(editor.userForm.age().errors()).not.toHaveLength(0)
    ref.forceClose()
  })

  it("creates with actual active role id and no credential fields; cancellation discards the draft", async () => {
    const { editor, users, roles, saved, element, ref } = await setup()
    expect(element.querySelector('input[type="password"]')).toBeNull()
    expect(element.textContent).toContain("Datos del usuario")
    expect(element.textContent).not.toMatch(/demo|demostración|en memoria|fictici|adaptador|marcador/i)
    expect(element.querySelector("#age-help")?.textContent).toBe("Ingresa la edad en años.")
    const select = element.querySelector<HTMLSelectElement>("#user-role")!
    select.value = String(roles.roles()[0].id)
    select.dispatchEvent(new Event("change", { bubbles: true }))
    expect(editor.model().roleId).toBe(String(roles.roles()[0].id))
    editor.model.set({ name: "  Nueva Persona  ", age: 28, email: "new@example.test", roleId: String(roles.roles()[0].id), lang: Lang.EN, isActive: true })
    await editor.save()
    expect(saved).toHaveBeenCalledOnce()
    const created = users.users().find(user => user.email === "new@example.test")!
    expect(created.name).toBe("Nueva Persona")
    expect(created.roleId).toBe(roles.roles()[0].id)
    expect(created.lastAccess).toBeNull()
    expect(Object.keys(created)).not.toContain("password")
    ref.forceClose()
    const next = await setup()
    next.editor.model.update(model => ({ ...model, name: "Unsaved" }))
    const count = next.users.users().length
    next.editor.cancel()
    expect(next.users.users()).toHaveLength(count)
    expect(next.editor.context.user).toBeNull()
    next.ref.forceClose()
  })

  it("retains an inactive current assignment but excludes it for new users and preserves lastAccess", async () => {
    await TestBed.inject(UsersDemoInitializer).initialize()
    const users = TestBed.inject(UserStore), roles = TestBed.inject(RolesStore)
    const user = users.users()[0], role = roles.roles().find(item => item.id === user.roleId)!
    await firstValueFrom(roles.updateRoleById(role.id, { name: role.name, description: role.description, isActive: false }))
    const { editor, ref } = await setup(user)
    expect(editor.availableRoles().find(item => item.id === role.id)?.isActive).toBe(false)
    editor.model.update(model => ({ ...model, name: "Edited", isActive: false }))
    await editor.save()
    expect(users.users().find(item => item.id === user.id)?.lastAccess?.getTime()).toBe(user.lastAccess?.getTime())
    expect(users.users().find(item => item.id === user.id)?.roleId).toBe(role.id)
    ref.forceClose()
    const next = await setup()
    expect(next.editor.availableRoles().some(item => item.id === role.id)).toBe(false)
    next.editor.model.update(model => ({ ...model, name: "New", email: "new@example.test", roleId: String(role.id) }))
    expect(next.editor.userForm().valid()).toBe(false)
    next.ref.forceClose()
  })

  it("disables duplicate submission and cancellation while pending and shows failures without success", async () => {
    const { editor, users, roles, saved, fixture, element, ref } = await setup()
    const response = new Subject<Result<User, UserError>>()
    const create = vi.spyOn(users, "createUser").mockReturnValue(response)
    const close = vi.spyOn(ref, "close")
    editor.model.set({ name: "New", age: 20, email: "new@example.test", lang: Lang.ES, isActive: true, roleId: String(roles.roles()[0].id) })
    const pending = editor.save()
    await Promise.resolve()
    expect(editor.userForm().submitting()).toBe(true)
    editor.cancel()
    await editor.save()
    expect(create).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
    TestBed.tick()
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
    response.next(Result.failure(new UserError("UNEXPECTED"))); response.complete()
    await pending
    await fixture.whenStable()
    expect(editor.error()).toContain("No pudimos guardar")
    expect(saved).not.toHaveBeenCalled()
    expect(editor.userForm().submitting()).toBe(false)
    create.mockReturnValue(of(Result.failure(new UserError("UNEXPECTED"))))
    await editor.save()
    expect(saved).not.toHaveBeenCalled()
    ref.forceClose()
  })
})
