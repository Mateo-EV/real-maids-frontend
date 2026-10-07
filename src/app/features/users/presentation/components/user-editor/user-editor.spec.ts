import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { Component, getDebugNode, inject } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { EMPTY, firstValueFrom, forkJoin, of, Subject } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { Result } from "@/app/shared/utils/result"
import { Lang, User } from "../../../domain/entities/user.entity"
import { UserError } from "../../../domain/errors/user.error"
import { USER_REPOSITORY } from "../../../domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "../../../domain/repositories/role.repository"
import { UserInMemorySource } from "../../../infrastructure/source/user-in-memory.source"
import { RoleInMemorySource } from "../../../infrastructure/source/role-in-memory.source"
import { UserStore } from "../../state/user.store"
import { RolesStore } from "../../state/roles.store"
async function loadCatalogs() {
  await flush(
    firstValueFrom(
      forkJoin({
        users: TestBed.inject(UserStore).loadUsers(),
        roles: TestBed.inject(RolesStore).loadRoles()
      })
    )
  )
}
import { UserEditor, UserEditorContext } from "./user-editor"

@Component({ template: `<button id="open-editor" (click)="open()">Open</button>` })
class TestHost {
  private readonly dialogs = inject(HlmDialogService)
  open(): void {
    this.dialogs.open<void, UserEditorContext>(UserEditor, {
      context: { user: null, onSaved: () => undefined },
      showCloseButton: false,
      disableClose: true
    })
  }
}

async function flush<T>(pending: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return pending
}

describe("UserEditor Signal Forms", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [
        { provide: USER_REPOSITORY, useExisting: UserInMemorySource },
        { provide: ROLE_REPOSITORY, useExisting: RoleInMemorySource }
      ]
    })
  )

  async function setup(user: User | null = null) {
    await loadCatalogs()
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    const saved = vi.fn()
    const ref = TestBed.inject(HlmDialogService).open<void, UserEditorContext>(UserEditor, {
      context: { user, onSaved: saved },
      showCloseButton: false,
      disableClose: true
    })
    await flush(fixture.whenStable())
    const element = document.querySelector<HTMLElement>("app-user-editor")!
    const editor = getDebugNode(element)!.injector.get(UserEditor)
    return {
      fixture,
      editor,
      saved,
      ref,
      element,
      users: TestBed.inject(UserStore),
      roles: TestBed.inject(RolesStore)
    }
  }

  it.each(["backdrop", "outside", "escape"])(
    "routes idle %s overlay interaction through Cancel",
    async interaction => {
      const { editor, element, saved, users, ref } = await setup()
      const cdk = getDebugNode(element)!.injector.get(CdkDialogRef)
      expect(cdk.disableClose).toBe(true)
      const cancel = vi.spyOn(editor, "cancel")
      element.querySelector<HTMLInputElement>("#user-name")!.click()
      expect(cancel).not.toHaveBeenCalled()
      expect(ref.state()).toBe("open")
      if (interaction === "backdrop") cdk.overlayRef.backdropElement!.click()
      else if (interaction === "outside") document.body.click()
      else
        element.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
        )
      await vi.runAllTimersAsync()
      expect(cancel).toHaveBeenCalled()
      expect(ref.state()).toBe("closed")
      expect(saved).not.toHaveBeenCalled()
      expect(users.users()).toHaveLength(48)
    }
  )

  it.each(["success", "failure"])(
    "tears down an editor request on destruction without late %s effects",
    async outcome => {
      const { editor, element, users, roles, saved, ref } = await setup()
      const response = new Subject<Result<User, UserError>>()
      vi.spyOn(users, "createUser").mockReturnValue(response)
      const close = vi.spyOn(ref, "close")
      const setError = vi.spyOn(editor.error, "set")
      editor.model.set({
        name: "New",
        age: 20,
        email: "new@example.test",
        password: "test-password",
        lang: Lang.ES,
        isActive: true,
        roleId: String(roles.roles()[0].id)
      })
      const pending = editor.save()
      await Promise.resolve()
      expect(response.observed).toBe(true)
      setError.mockClear()
      getDebugNode(element)!.injector.get(CdkDialogRef).close()
      expect(response.observed).toBe(false)
      response.next(
        outcome === "success"
          ? Result.success(users.users()[0])
          : Result.failure(new UserError("UNEXPECTED"))
      )
      response.complete()
      await pending
      expect(saved).not.toHaveBeenCalled()
      expect(close).not.toHaveBeenCalled()
      expect(setError).not.toHaveBeenCalled()
      expect(editor.userForm().submitting()).toBe(false)
    }
  )

  it("cancels the real delayed mutation and finalizes loading when destroyed", async () => {
    const { editor, element, users, roles, saved } = await setup()
    editor.model.set({
      name: "Cancelled",
      age: 20,
      email: "cancelled@example.test",
      password: "test-password",
      lang: Lang.ES,
      isActive: true,
      roleId: String(roles.roles()[0].id)
    })
    const pending = editor.save()
    await Promise.resolve()
    expect(users.loading()).toBe(true)
    getDebugNode(element)!.injector.get(CdkDialogRef).close()
    await flush(pending)
    expect(users.loading()).toBe(false)
    expect(users.users()).toHaveLength(48)
    expect(editor.error()).toBe("")
    expect(saved).not.toHaveBeenCalled()
  })

  it("does not dismiss on the click that opens the overlay or on non-dismissal keys", async () => {
    await loadCatalogs()
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    fixture.nativeElement.querySelector("#open-editor").click()
    await flush(fixture.whenStable())
    const element = document.querySelector<HTMLElement>("app-user-editor")!
    const editor = getDebugNode(element)!.injector.get(UserEditor)
    const cancel = vi.spyOn(editor, "cancel")
    const cdk = getDebugNode(element)!.injector.get(CdkDialogRef)
    element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, ctrlKey: true, bubbles: true })
    )
    expect(cancel).not.toHaveBeenCalled()
    expect(cdk.overlayRef.hasAttached()).toBe(true)
    cdk.close()
    document.body.click()
    expect(cancel).not.toHaveBeenCalled()
  })

  it("settles empty request completion without success or error and unlocks Cancel", async () => {
    const { editor, users, roles, saved, element, ref } = await setup()
    vi.spyOn(users, "createUser").mockReturnValue(EMPTY)
    editor.model.set({
      name: "New",
      age: 20,
      email: "new@example.test",
      password: "test-password",
      lang: Lang.ES,
      isActive: true,
      roleId: String(roles.roles()[0].id)
    })
    await editor.save()
    expect(editor.error()).toBe("")
    expect(saved).not.toHaveBeenCalled()
    expect(editor.userForm().submitting()).toBe(false)
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    await vi.runAllTimersAsync()
    expect(ref.state()).toBe("closed")
  })

  it("inherits global primary on the overlay host without feature tokens or hover overrides", async () => {
    const { element, ref } = await setup()
    expect(element.closest("app-users-page")).toBeNull()
    const hostScope = element.getAttributeNames().find(name => name.startsWith("_nghost-"))!
    const css = Array.from(document.querySelectorAll("style"))
      .map(style => style.textContent ?? "")
      .find(text => text.includes(`[${hostScope}]`))!
    expect(css).not.toMatch(/--primary(?:-foreground)?:/)
    expect(css).not.toMatch(/\[hlmBtn\].*\.bg-primary.*:hover/)
    const submit = element.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(submit.classList.contains("bg-primary")).toBe(true)
    expect(submit.classList.contains("text-primary-foreground")).toBe(true)
    expect(submit.style.getPropertyValue("--primary")).toBe("")
    ref.forceClose()
  })

  it("rejects missing name/email/role, malformed email and invalid numeric age with visible errors", async () => {
    const { editor, users, fixture, element, ref } = await setup()
    const create = vi.spyOn(users, "createUser")
    await flush(editor.save())
    await flush(fixture.whenStable())
    expect(create).not.toHaveBeenCalled()
    expect(editor.userForm.name().touched()).toBe(true)
    expect(element.textContent).toContain("Ingresa el nombre")
    const roleSelect = element.querySelector<HTMLSelectElement>("#user-role")!
    const describedBy = roleSelect.getAttribute("aria-describedby") ?? ""
    const roleError = element.querySelector<HTMLElement>("hlm-native-select + p + hlm-field-error")
    expect(describedBy.split(" ")).toContain(roleError?.id)
    editor.model.set({
      name: "   ",
      age: -1,
      email: "invalid",
      password: "",
      roleId: "",
      lang: Lang.ES,
      isActive: true
    })
    expect(editor.userForm().valid()).toBe(false)
    expect(editor.userForm.age().errors()).not.toHaveLength(0)
    ref.forceClose()
  })

  it("creates with an active role and valid password without persisting credentials; cancellation discards the draft", async () => {
    const { editor, users, roles, saved, element, ref } = await setup()
    const password = element.querySelector<HTMLInputElement>('#user-password[type="password"]')!
    expect(password).not.toBeNull()
    expect(password.getAttribute("minlength")).toBe("8")
    expect(element.querySelector('label[for="user-password"]')?.textContent).toContain(
      "obligatorio"
    )
    const create = vi.spyOn(users, "createUser")
    expect(element.textContent).toContain("Datos del usuario")
    expect(element.textContent).not.toMatch(
      /demo|demostración|en memoria|fictici|adaptador|marcador/i
    )
    expect(element.querySelector("#age-help")?.textContent).toBe("Ingresa la edad en años.")
    const select = element.querySelector<HTMLSelectElement>("#user-role")!
    select.value = String(roles.roles()[0].id)
    select.dispatchEvent(new Event("change", { bubbles: true }))
    expect(editor.model().roleId).toBe(String(roles.roles()[0].id))
    editor.model.set({
      name: "  Nueva Persona  ",
      age: 28,
      email: "new@example.test",
      password: "",
      roleId: String(roles.roles()[0].id),
      lang: Lang.EN,
      isActive: true
    })
    await flush(editor.save())
    expect(create).not.toHaveBeenCalled()
    expect(saved).not.toHaveBeenCalled()
    password.value = "short"
    password.dispatchEvent(new Event("input", { bubbles: true }))
    expect(editor.model().password).toBe("short")
    await flush(editor.save())
    expect(create).not.toHaveBeenCalled()
    expect(saved).not.toHaveBeenCalled()
    password.value = "  test-password  "
    password.dispatchEvent(new Event("input", { bubbles: true }))
    expect(editor.model().password).toBe("  test-password  ")
    expect(editor.userForm().valid()).toBe(true)
    await flush(editor.save())
    expect(create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ password: "test-password" })
    )
    expect(saved).toHaveBeenCalledOnce()
    expect(ref.state()).toBe("closed")
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
    await loadCatalogs()
    const users = TestBed.inject(UserStore),
      roles = TestBed.inject(RolesStore)
    const user = users.users()[0],
      role = roles.roles().find(item => item.id === user.roleId)!
    await flush(
      firstValueFrom(
        roles.updateRoleById(role.id, {
          name: role.name,
          description: role.description,
          isActive: false
        })
      )
    )
    const { editor, ref } = await setup(user)
    expect(editor.availableRoles().find(item => item.id === role.id)?.isActive).toBe(false)
    editor.model.update(model => ({ ...model, name: "Edited", isActive: false }))
    await flush(editor.save())
    expect(
      users
        .users()
        .find(item => item.id === user.id)
        ?.lastAccess?.getTime()
    ).toBe(user.lastAccess?.getTime())
    expect(users.users().find(item => item.id === user.id)?.roleId).toBe(role.id)
    ref.forceClose()
    const next = await setup()
    expect(next.editor.availableRoles().some(item => item.id === role.id)).toBe(false)
    next.editor.model.update(model => ({
      ...model,
      name: "New",
      email: "new@example.test",
      roleId: String(role.id)
    }))
    expect(next.editor.userForm().valid()).toBe(false)
    next.ref.forceClose()
  })

  it("disables duplicate submission and cancellation while pending and shows failures without success", async () => {
    const { editor, users, roles, saved, fixture, element, ref } = await setup()
    const success = vi.spyOn(TestBed.inject(HotToastService), "success")
    const response = new Subject<Result<User, UserError>>()
    const create = vi.spyOn(users, "createUser").mockReturnValue(response)
    const close = vi.spyOn(ref, "close")
    editor.model.set({
      name: "New",
      age: 20,
      email: "new@example.test",
      password: "test-password",
      lang: Lang.ES,
      isActive: true,
      roleId: String(roles.roles()[0].id)
    })
    const pending = editor.save()
    await Promise.resolve()
    expect(editor.userForm().submitting()).toBe(true)
    editor.cancel()
    await editor.save()
    expect(create).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
    TestBed.tick()
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true)
    expect(element.querySelector<HTMLButtonElement>('button[type="button"]')?.disabled).toBe(true)
    const cdk = getDebugNode(element)!.injector.get(CdkDialogRef)
    cdk.overlayRef.backdropElement!.click()
    document.body.click()
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    expect(close).not.toHaveBeenCalled()
    expect(ref.state()).toBe("open")
    response.next(Result.failure(new UserError("UNEXPECTED")))
    response.complete()
    await pending
    await flush(fixture.whenStable())
    expect(editor.error()).toContain("No pudimos guardar")
    expect(saved).not.toHaveBeenCalled()
    expect(success).not.toHaveBeenCalled()
    expect(editor.userForm().submitting()).toBe(false)
    TestBed.tick()
    expect(element.querySelector<HTMLButtonElement>('button[type="button"]')?.disabled).toBe(false)
    create.mockReturnValue(of(Result.failure(new UserError("UNEXPECTED"))))
    await editor.save()
    expect(saved).not.toHaveBeenCalled()
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    await vi.runAllTimersAsync()
    expect(ref.state()).toBe("closed")
  })
})
