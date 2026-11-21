import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { Component, getDebugNode, inject, signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { EMPTY, firstValueFrom, forkJoin, of, Subject, timer, map } from "rxjs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { HotToastService } from "@ngxpert/hot-toast"
import { Result } from "@/app/shared/utils/result"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { Lang, User } from "../../../domain/entities/user.entity"
import { Role } from "../../../domain/entities/role.entity"
import { UserError } from "../../../domain/errors/user.error"
import { USER_REPOSITORY } from "../../../domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "../../../domain/repositories/role.repository"
import { UserStore } from "../../state/user.store"
import { RolesStore } from "../../state/roles.store"
async function loadCatalogs() {
  await flush(
    firstValueFrom(
      forkJoin({
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
  beforeEach(() => {
    vi.useFakeTimers()
    const now = new Date("2026-09-01T00:00:00Z")
    roleData = [
      ...Array.from({ length: 5 }, (_, index) =>
        Role.create(index + 1, `Role ${index + 1}`, "", true, now)
      ),
      // El backend crea la ficha del cliente sólo para su rol CLIENTE, identificado por nombre exacto.
      Role.create(6, "CLIENTE", "Cuenta del portal", true, now)
    ]
    data = Array.from({ length: 48 }, (_, index) =>
      User.create(
        index + 1,
        `User ${index + 1}`,
        `user${index + 1}@example.test`,
        Lang.ES,
        true,
        now,
        now,
        (index % 5) + 1,
        null
      )
    )
  })
  afterEach(() => vi.useRealTimers())
  let data: User[]
  let roleData: Role[]
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [
        {
          provide: USER_REPOSITORY,
          useValue: {
            getUserById: (id: number) => of(Result.success(data.find(item => item.id === id)!)),
            getUsersPage: () =>
              of(Result.success({ items: data, total: data.length, offset: 0, limit: 20 })),
            getUserStatistics: () =>
              of(
                Result.success({
                  total: data.length,
                  active: data.filter(item => item.isActive).length,
                  inactive: data.filter(item => !item.isActive).length
                })
              ),
            createUser: (params: {
              name: string
              email: string
              lang: Lang
              isActive: boolean
              roleId: number
            }) =>
              timer(250).pipe(
                map(() => {
                  const now = new Date()
                  const created = User.create(
                    data.length + 1,
                    params.name.trim(),
                    params.email,
                    params.lang,
                    params.isActive,
                    now,
                    now,
                    params.roleId
                  )
                  data = [...data, created]
                  return Result.success(created)
                })
              ),
            updateUserById: (
              id: number,
              params: { name: string; email: string; lang: Lang; isActive: boolean; roleId: number }
            ) => {
              const previous = data.find(item => item.id === id)!
              const updated = User.create(
                id,
                params.name.trim(),
                params.email,
                params.lang,
                params.isActive,
                previous.createdAt,
                new Date(),
                params.roleId,
                previous.lastAccess
              )
              data = data.map(item => (item.id === id ? updated : item))
              return of(Result.success(updated))
            },
            updateUserStatusById: (id: number, isActive: boolean) => {
              const previous = data.find(item => item.id === id)!
              const updated = User.create(
                previous.id,
                previous.name,
                previous.email,
                previous.lang,
                isActive,
                previous.createdAt,
                new Date(),
                previous.roleId,
                previous.lastAccess
              )
              data = data.map(item => (item.id === id ? updated : item))
              return of(Result.success(updated))
            },
            deleteUserById: (id: number) => {
              data = data.filter(item => item.id !== id)
              return of(Result.success<void>(undefined))
            }
          }
        },
        {
          provide: ROLE_REPOSITORY,
          useValue: {
            getRoles: () => of(Result.success(roleData)),
            getRoleById: (id: number) => of(Result.success(roleData.find(item => item.id === id)!)),
            updateRoleById: (
              id: number,
              params: { name: string; description: string; isActive: boolean }
            ) => {
              const previous = roleData.find(item => item.id === id)!
              const updated = Role.create(
                id,
                params.name,
                params.description,
                params.isActive,
                previous.createdAt
              )
              roleData = roleData.map(item => (item.id === id ? updated : item))
              return of(Result.success(updated))
            }
          }
        },
        {
          provide: AuthStore,
          useValue: {
            session: signal(AuthSession.create("Editor test", "editor@example.test", null, null, 1))
          }
        },
        {
          provide: ObserveAuthSessionUseCase,
          useValue: {
            execute: () => of(TestBed.inject(AuthStore).session())
          }
        }
      ]
    })
  )

  async function records() {
    return data
  }
  function clientRole(roles: { roles(): Role[] }): Role {
    return roles.roles().find(role => role.name === "CLIENTE")!
  }

  function customerAccountUser(customerId: number | null): User {
    const now = new Date("2026-09-01T00:00:00Z")
    return User.create(
      99,
      "Cliente Nuevo",
      "cliente@example.test",
      Lang.ES,
      true,
      now,
      now,
      6,
      null,
      customerId
    )
  }

  async function selectRole(element: HTMLElement, roleId: number): Promise<void> {
    const select = element.querySelector<HTMLSelectElement>("#user-role")!
    select.value = String(roleId)
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await vi.runAllTimersAsync()
    TestBed.tick()
  }

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

  it("keeps the shared header first and its title/description free of decorative text", async () => {
    const { element } = await setup()
    const header = element.firstElementChild!
    expect(header.getAttribute("data-slot")).toBe("dialog-header")
    expect(header.querySelector('[data-slot="dialog-title"]')!.textContent).toBe("Nuevo usuario")
    expect(header.querySelector('[data-slot="dialog-description"]')!.textContent).toBe(
      "Datos del usuario y rol asignado."
    )
    expect(header.querySelector('[data-slot="dialog-title"]')!.children).toHaveLength(0)
  })

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
      expect(await records()).toHaveLength(48)
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
        email: "new@example.test",
        password: "FakePassword1",
        lang: Lang.ES,
        isActive: true,
        roleId: String(roles.roles()[0].id),
        customerType: "",
        phone: ""
      })
      const pending = editor.save()
      await Promise.resolve()
      expect(response.observed).toBe(true)
      setError.mockClear()
      getDebugNode(element)!.injector.get(CdkDialogRef).close()
      expect(response.observed).toBe(false)
      response.next(
        outcome === "success"
          ? Result.success((await records())[0])
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
      email: "cancelled@example.test",
      password: "FakePassword1",
      lang: Lang.ES,
      isActive: true,
      roleId: String(roles.roles()[0].id),
      customerType: "",
      phone: ""
    })
    const pending = editor.save()
    await Promise.resolve()
    expect(users.loading()).toBe(true)
    getDebugNode(element)!.injector.get(CdkDialogRef).close()
    await flush(pending)
    expect(users.loading()).toBe(false)
    expect(await records()).toHaveLength(48)
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
      email: "new@example.test",
      password: "FakePassword1",
      lang: Lang.ES,
      isActive: true,
      roleId: String(roles.roles()[0].id),
      customerType: "",
      phone: ""
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

  it("rejects missing name/email/role and malformed email with visible errors", async () => {
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
      email: "invalid",
      password: "",
      roleId: "",
      lang: Lang.ES,
      isActive: true,
      customerType: "",
      phone: ""
    })
    expect(editor.userForm().valid()).toBe(false)
    expect(editor.userForm.email().errors()).not.toHaveLength(0)
    expect(editor.model()).not.toHaveProperty("age")
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
    expect(element.querySelector("#user-age")).toBeNull()
    const select = element.querySelector<HTMLSelectElement>("#user-role")!
    select.value = String(roles.roles()[0].id)
    select.dispatchEvent(new Event("change", { bubbles: true }))
    expect(editor.model().roleId).toBe(String(roles.roles()[0].id))
    editor.model.set({
      name: "  Nueva Persona  ",
      email: "new@example.test",
      password: "",
      roleId: String(roles.roles()[0].id),
      lang: Lang.EN,
      isActive: true,
      customerType: "",
      phone: ""
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
    password.value = "  FakePassword1  "
    password.dispatchEvent(new Event("input", { bubbles: true }))
    expect(editor.model().password).toBe("  FakePassword1  ")
    expect(editor.userForm().valid()).toBe(true)
    await flush(editor.save())
    expect(create).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ password: "  FakePassword1  " })
    )
    expect(saved).toHaveBeenCalledOnce()
    expect(ref.state()).toBe("closed")
    const created = (await records()).find(user => user.email === "new@example.test")!
    expect(created.name).toBe("Nueva Persona")
    expect(created.roleId).toBe(roles.roles()[0].id)
    expect(created.lastAccess).toBeNull()
    expect(Object.keys(created)).not.toContain("password")
    ref.forceClose()
    const next = await setup()
    next.editor.model.update(model => ({ ...model, name: "Unsaved" }))
    const count = (await records()).length
    next.editor.cancel()
    expect(await records()).toHaveLength(count)
    expect(next.editor.context.user).toBeNull()
    next.ref.forceClose()
  })

  it("retains an inactive current assignment but excludes it for new users and preserves lastAccess", async () => {
    await loadCatalogs()
    const users = TestBed.inject(UserStore),
      roles = TestBed.inject(RolesStore)
    const user = (await records())[0],
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
    const updated = (await records()).find(item => item.id === user.id)!
    expect(updated.lastAccess?.getTime()).toBe(user.lastAccess?.getTime())
    expect(updated.roleId).toBe(role.id)
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
      email: "new@example.test",
      password: "FakePassword1",
      lang: Lang.ES,
      isActive: true,
      roleId: String(roles.roles()[0].id),
      customerType: "",
      phone: ""
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

  it("warns that a CLIENTE account creates a customer and hides those fields otherwise", async () => {
    const { editor, element, roles, ref } = await setup()
    const client = clientRole(roles)
    expect(element.querySelector("#user-customer-warning")).toBeNull()
    expect(element.querySelector("#user-customer-type")).toBeNull()
    expect(element.querySelector("#user-customer-phone")).toBeNull()
    await selectRole(element, client.id)
    expect(editor.model().roleId).toBe(String(client.id))
    const warning = element.querySelector("#user-customer-warning")!
    expect(warning.textContent).toContain("Se creará un cliente")
    expect(warning.textContent).toContain("CLIENTE")
    expect(warning.querySelector("button")).toBeNull()
    expect(element.querySelector("#user-customer-type")).not.toBeNull()
    expect(element.querySelector("#user-customer-phone")).not.toBeNull()
    await selectRole(element, roles.roles()[0].id)
    expect(element.querySelector("#user-customer-warning")).toBeNull()
    expect(element.querySelector("#user-customer-type")).toBeNull()
    expect(element.querySelector("#user-customer-phone")).toBeNull()
    ref.forceClose()
  })

  it("sends the customer-only fields for CLIENTE and never for another role", async () => {
    const { editor, users, roles, ref } = await setup()
    const client = clientRole(roles)
    const create = vi
      .spyOn(users, "createUser")
      .mockReturnValue(of(Result.failure(new UserError("UNEXPECTED"))))
    editor.model.set({
      name: "Cliente Nuevo",
      email: "cliente@example.test",
      password: "FakePassword1",
      lang: Lang.ES,
      isActive: true,
      roleId: String(client.id),
      customerType: "",
      phone: "  999 111 222  "
    })
    await flush(editor.save())
    expect(create).not.toHaveBeenCalled()
    editor.model.update(model => ({ ...model, customerType: "comercial" }))
    await flush(editor.save())
    expect(create).toHaveBeenLastCalledWith(
      expect.objectContaining({
        roleId: client.id,
        customerType: "comercial",
        phone: "999 111 222"
      })
    )
    const other = roles.roles()[0]
    editor.model.update(model => ({ ...model, phone: "   " }))
    await flush(editor.save())
    const blankPhone = create.mock.calls.at(-1)![0] as unknown as Record<string, unknown>
    expect(blankPhone).toHaveProperty("customerType", "comercial")
    expect(blankPhone).not.toHaveProperty("phone")
    editor.model.update(model => ({
      ...model,
      roleId: String(other.id),
      email: "other@example.test",
      customerType: "residencial",
      phone: "999 111 222"
    }))
    await flush(editor.save())
    const params = create.mock.calls.at(-1)![0] as unknown as Record<string, unknown>
    expect(params).not.toHaveProperty("customerType")
    expect(params).not.toHaveProperty("phone")
    ref.forceClose()
  })

  it("requires tipo for CLIENTE and clears the customer fields and their validation on role change", async () => {
    const { editor, users, element, roles, ref } = await setup()
    const client = clientRole(roles),
      other = roles.roles()[0]
    const create = vi.spyOn(users, "createUser")
    await selectRole(element, client.id)
    editor.model.update(model => ({
      ...model,
      name: "Cliente Nuevo",
      email: "cliente@example.test",
      password: "FakePassword1",
      phone: "999 111 222",
      customerType: ""
    }))
    await flush(editor.save())
    TestBed.tick()
    expect(create).not.toHaveBeenCalled()
    expect(editor.userForm.customerType().touched()).toBe(true)
    expect(element.textContent).toContain("Selecciona el tipo de cliente")
    editor.model.update(model => ({ ...model, customerType: "residencial", phone: "abc" }))
    await flush(editor.save())
    TestBed.tick()
    expect(create).not.toHaveBeenCalled()
    expect(element.textContent).toContain("Ingresa un teléfono válido")
    await selectRole(element, other.id)
    expect(editor.model().customerType).toBe("")
    expect(editor.model().phone).toBe("")
    expect(editor.userForm.customerType().touched()).toBe(false)
    expect(editor.userForm.phone().touched()).toBe(false)
    expect(editor.userForm().valid()).toBe(true)
    expect(element.textContent).not.toContain("Selecciona el tipo de cliente")
    ref.forceClose()
  })

  it("explains the missing customer-creation permission when a CLIENTE account is forbidden", async () => {
    const { editor, users, roles, saved, ref } = await setup()
    vi.spyOn(users, "createUser").mockReturnValue(of(Result.failure(new UserError("FORBIDDEN"))))
    editor.model.set({
      name: "Cliente Nuevo",
      email: "cliente@example.test",
      password: "FakePassword1",
      lang: Lang.ES,
      isActive: true,
      roleId: String(clientRole(roles).id),
      customerType: "residencial",
      phone: ""
    })
    await flush(editor.save())
    expect(editor.error()).toContain("CLIENTE_CREAR")
    expect(editor.error()).toContain("permiso")
    expect(editor.error()).not.toContain("No tienes permiso para guardar estos cambios")
    expect(saved).not.toHaveBeenCalled()
    expect(ref.state()).toBe("open")
    expect(editor.model().customerType).toBe("residencial")
  })

  it("keeps the generic forbidden message for the other roles", async () => {
    const { editor, users, roles } = await setup()
    vi.spyOn(users, "createUser").mockReturnValue(of(Result.failure(new UserError("FORBIDDEN"))))
    editor.model.set({
      name: "Nueva Persona",
      email: "persona@example.test",
      password: "FakePassword1",
      lang: Lang.ES,
      isActive: true,
      roleId: String(roles.roles()[0].id),
      customerType: "",
      phone: ""
    })
    await flush(editor.save())
    expect(editor.error()).toBe("No tienes permiso para guardar estos cambios.")
  })

  it("binds a reserved email to the email field with the shared-address explanation", async () => {
    const { editor, users, roles, element, ref } = await setup()
    vi.spyOn(users, "createUser").mockReturnValue(
      of(Result.failure(new UserError("EMAIL_ALREADY_EXISTS")))
    )
    editor.model.set({
      name: "Nueva Persona",
      email: "persona@example.test",
      password: "FakePassword1",
      lang: Lang.ES,
      isActive: true,
      roleId: String(roles.roles()[0].id),
      customerType: "",
      phone: ""
    })
    await flush(editor.save())
    TestBed.tick()
    expect(editor.error()).toBe("")
    const fieldError = element.querySelector("#user-email-account-error")
    expect(fieldError?.textContent).toContain("ya pertenece a una cuenta del portal o a un cliente")
    expect(fieldError?.getAttribute("role")).toBe("alert")
    element
      .querySelector<HTMLInputElement>("#user-email")!
      .dispatchEvent(new Event("input", { bubbles: true }))
    TestBed.tick()
    expect(element.querySelector("#user-email-account-error")).toBeNull()
    ref.forceClose()
  })

  it("reports the created customer reference on confirmed success", async () => {
    const { editor, users, roles, saved, ref } = await setup()
    vi.spyOn(users, "createUser").mockReturnValue(of(Result.success(customerAccountUser(12))))
    editor.model.set({
      name: "Cliente Nuevo",
      email: "cliente@example.test",
      password: "FakePassword1",
      lang: Lang.ES,
      isActive: true,
      roleId: String(clientRole(roles).id),
      customerType: "residencial",
      phone: "999 111 222"
    })
    await flush(editor.save())
    expect(saved).toHaveBeenCalledExactlyOnceWith({
      created: true,
      customerCreated: true,
      customerId: 12
    })
    expect(ref.state()).toBe("closed")
  })

  it("keeps the customer-only fields out of the edit form and payload", async () => {
    const { editor, users, element, ref } = await setup(customerAccountUser(12))
    expect(element.querySelector("#user-customer-warning")).toBeNull()
    expect(element.querySelector("#user-customer-type")).toBeNull()
    expect(element.querySelector("#user-customer-phone")).toBeNull()
    const update = vi
      .spyOn(users, "updateUserById")
      .mockReturnValue(of(Result.success(customerAccountUser(12))))
    editor.model.update(model => ({ ...model, name: "Editado" }))
    await flush(editor.save())
    expect(update).toHaveBeenCalledOnce()
    expect(update.mock.calls[0][1]).not.toHaveProperty("customerType")
    expect(update.mock.calls[0][1]).not.toHaveProperty("phone")
    ref.forceClose()
  })
})
