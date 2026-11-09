import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { Component, getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EMPTY, firstValueFrom, of, Subject, throwError, timer, map } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Lang, User } from "../../../domain/entities/user.entity"
import { UserError } from "../../../domain/errors/user.error"
import { USER_REPOSITORY, UserRepository } from "../../../domain/repositories/user.repository"
import { UserStore } from "../../state/user.store"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { UserStatusContext, UserStatusDialog } from "./user-status-dialog"

@Component({ template: "" })
class TestHost {}

async function flush<T>(pending: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return pending
}

describe("UserStatusDialog", () => {
  let user: User
  let repository: UserRepository
  beforeEach(() => {
    vi.useFakeTimers()
    user = User.create(
      1,
      "Test User",
      "test@example.test",
      Lang.ES,
      true,
      new Date(0),
      new Date(0),
      1
    )
    repository = {
      getUserStatistics: () =>
        of(
          Result.success({
            total: 1,
            active: Number(user.isActive),
            inactive: Number(!user.isActive)
          })
        ),
      getUsersPage: () => of(Result.success({ items: [user], total: 1, offset: 0, limit: 20 })),
      createUser: () => of(Result.failure(new UserError("UNEXPECTED"))),
      getUserById: () => of(Result.success(user)),
      updateUserStatusById: (_id, active) =>
        timer(250).pipe(
          map(() => {
            user = User.create(
              user.id,
              user.name,
              user.email,
              user.lang,
              active,
              user.createdAt,
              new Date(),
              user.roleId,
              user.lastAccess
            )
            return Result.success(user)
          })
        ),
      updateUserById: () => of(Result.success(user)),
      deleteUserById: () => of(Result.success<void>(undefined))
    }
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [{ provide: USER_REPOSITORY, useValue: repository }]
    })
  })
  afterEach(() => vi.useRealTimers())

  async function records() {
    return [user]
  }
  async function setup(active = true) {
    const users = TestBed.inject(UserStore)
    if (user.isActive !== active)
      user = User.create(
        user.id,
        user.name,
        user.email,
        user.lang,
        active,
        user.createdAt,
        user.updatedAt,
        user.roleId,
        user.lastAccess
      )
    const selectedUser = user
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    const changed = vi.fn()
    const ref = TestBed.inject(HlmDialogService).open<void, UserStatusContext>(UserStatusDialog, {
      context: { user, onChanged: changed },
      showCloseButton: false,
      disableClose: true
    })
    await flush(fixture.whenStable())
    const element = document.querySelector<HTMLElement>("app-user-status-dialog")!
    const injector = getDebugNode(element)!.injector
    return {
      users,
      user: selectedUser,
      changed,
      ref,
      element,
      dialog: injector.get(UserStatusDialog),
      cdk: injector.get(CdkDialogRef)
    }
  }

  it.each([true, false])(
    "keeps the shared header first for active=%s without decorative title text",
    async active => {
      const { element } = await setup(active)
      const header = element.firstElementChild!
      expect(header.getAttribute("data-slot")).toBe("dialog-header")
      const title = header.querySelector('[data-slot="dialog-title"]')!
      expect(title.textContent).toBe(active ? "Desactivar usuario" : "Activar usuario")
      expect(title.children).toHaveLength(0)
      expect(header.querySelector('[data-slot="dialog-description"]')!.textContent).toBe(
        "Confirma el cambio de estado de este perfil."
      )
    }
  )

  it.each([true, false])(
    "confirms the intended change for active=%s with ID/status only and preserved metadata",
    async active => {
      const { users, user, changed, ref, element, dialog } = await setup(active)
      const before = { ...user }
      const profileUpdate = vi.spyOn(users, "updateUserById")
      const update = vi.spyOn(users, "updateUserStatusById")
      expect(element.textContent).toContain(user.name)
      expect(element.textContent).toContain(user.email)
      expect(element.textContent).toContain(active ? "Desactivar usuario" : "Activar usuario")
      expect(element.textContent).toContain(active ? "Activo → Inactivo" : "Inactivo → Activo")
      expect(update).not.toHaveBeenCalled()
      const pending = dialog.confirm()
      expect(changed).not.toHaveBeenCalled()
      expect(update).toHaveBeenCalledExactlyOnceWith(user.id, !active)
      expect(profileUpdate).not.toHaveBeenCalled()
      await flush(pending)
      const updated = (await records()).find(item => item.id === user.id)!
      expect(updated).toEqual({ ...before, isActive: !active, updatedAt: expect.any(Date) })
      expect(user).toEqual(before)
      expect(changed).toHaveBeenCalledOnce()
      expect(ref.state()).toBe("closed")
    }
  )

  it.each(["cancel", "backdrop", "outside", "escape"])(
    "dismisses idle %s without mutation",
    async action => {
      const { users, changed, ref, element, dialog, cdk } = await setup()
      const update = vi.spyOn(users, "updateUserStatusById")
      element.querySelector("p")!.click()
      expect(ref.state()).toBe("open")
      if (action === "cancel") dialog.cancel()
      else if (action === "backdrop") cdk.overlayRef.backdropElement!.click()
      else if (action === "outside") document.body.click()
      else
        element.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
        )
      await vi.runAllTimersAsync()
      expect(ref.state()).toBe("closed")
      expect(update).not.toHaveBeenCalled()
      expect(changed).not.toHaveBeenCalled()
    }
  )

  it("blocks duplicate submit and every dismissal while pending, then allows retry after Result failure", async () => {
    const { users, user, changed, ref, element, dialog, cdk } = await setup()
    const response = new Subject<Result<User, UserError>>()
    const update = vi.spyOn(users, "updateUserStatusById").mockReturnValueOnce(response)
    const pending = dialog.confirm()
    await dialog.confirm()
    dialog.cancel()
    TestBed.tick()
    expect(element.querySelectorAll("button:disabled")).toHaveLength(2)
    expect(element.querySelector('[aria-busy="true"]')).not.toBeNull()
    expect(element.querySelector("hlm-spinner")).not.toBeNull()
    cdk.overlayRef.backdropElement!.click()
    document.body.click()
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    expect(ref.state()).toBe("open")
    expect(update).toHaveBeenCalledOnce()
    response.next(Result.failure(new UserError("UNEXPECTED")))
    response.complete()
    await pending
    TestBed.tick()
    expect(element.querySelector('[role="alert"]')?.textContent).toContain("No pudimos cambiar")
    expect(dialog.submitting()).toBe(false)
    expect((await records()).find(item => item.id === user.id)?.isActive).toBe(true)
    expect(changed).not.toHaveBeenCalled()
    await flush(dialog.confirm())
    expect(update).toHaveBeenCalledTimes(2)
    expect(update.mock.calls).toEqual([
      [user.id, false],
      [user.id, false]
    ])
    expect(changed).toHaveBeenCalledOnce()
  })

  it("shows thrown operation errors without success and unlocks Cancel", async () => {
    const { users, changed, ref, dialog } = await setup()
    vi.spyOn(users, "updateUserStatusById").mockReturnValue(throwError(() => new Error("offline")))
    await dialog.confirm()
    expect(dialog.error()).toContain("No pudimos cambiar")
    expect(dialog.submitting()).toBe(false)
    expect(changed).not.toHaveBeenCalled()
    dialog.cancel()
    await vi.runAllTimersAsync()
    expect(ref.state()).toBe("closed")
  })

  it("shows a missing-user Result error and keeps the dialog open without success", async () => {
    const { users, changed, ref, dialog, element } = await setup()
    vi.spyOn(users, "updateUserStatusById").mockReturnValue(
      of(Result.failure(new UserError("USER_NOT_FOUND")))
    )
    await dialog.confirm()
    TestBed.tick()
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      "El usuario ya no existe"
    )
    expect(ref.state()).toBe("open")
    expect(changed).not.toHaveBeenCalled()
    expect(dialog.submitting()).toBe(false)
  })

  it("settles empty completion without success and unlocks dismissal", async () => {
    const { users, changed, dialog, ref } = await setup()
    vi.spyOn(users, "updateUserStatusById").mockReturnValue(EMPTY)
    await dialog.confirm()
    expect(changed).not.toHaveBeenCalled()
    expect(dialog.submitting()).toBe(false)
    dialog.cancel()
    await vi.runAllTimersAsync()
    expect(ref.state()).toBe("closed")
  })

  it.each(["success", "failure"])(
    "cancels on destruction and suppresses late %s feedback",
    async outcome => {
      const { users, user, changed, ref, dialog, cdk } = await setup()
      const response = new Subject<Result<User, UserError>>()
      const update = vi.spyOn(users, "updateUserStatusById").mockReturnValue(response)
      const pending = dialog.confirm()
      const setError = vi.spyOn(dialog.error, "set")
      const close = vi.spyOn(ref, "close")
      cdk.close()
      expect(response.observed).toBe(false)
      response.next(
        outcome === "success" ? Result.success(user) : Result.failure(new UserError("UNEXPECTED"))
      )
      response.complete()
      await pending
      await dialog.confirm()
      dialog.cancel()
      expect(update).toHaveBeenCalledOnce()
      expect(changed).not.toHaveBeenCalled()
      expect(setError).not.toHaveBeenCalled()
      expect(close).not.toHaveBeenCalled()
    }
  )

  it("cancels a real update before its effects on destruction", async () => {
    const { users, user, changed, dialog, cdk } = await setup()
    const pending = dialog.confirm()
    expect(users.loading()).toBe(true)
    cdk.close()
    await flush(pending)
    expect(users.loading()).toBe(false)
    expect((await records()).find(item => item.id === user.id)).toEqual(user)
    expect(changed).not.toHaveBeenCalled()
    expect(dialog.error()).toBe("")
  })
})
