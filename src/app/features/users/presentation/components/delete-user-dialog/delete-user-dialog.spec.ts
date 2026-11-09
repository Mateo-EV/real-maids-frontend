import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { Component, getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"
import { EMPTY, of, Subject, timer, map } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserError } from "../../../domain/errors/user.error"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { USER_REPOSITORY } from "../../../domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "../../../domain/repositories/role.repository"
import { Lang, User } from "../../../domain/entities/user.entity"
import { UserStore } from "../../state/user.store"
import { DeleteUserContext, DeleteUserDialog } from "./delete-user-dialog"

@Component({ template: "" })
class TestHost {}

async function flush<T>(pending: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync()
  return pending
}

describe("DeleteUserDialog", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  let data: User[]
  beforeEach(() => {
    data = [
      User.create(1, "Test User", "test@example.test", Lang.ES, true, new Date(0), new Date(0), 1)
    ]
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [
        {
          provide: USER_REPOSITORY,
          useValue: {
            getUserById: (id: number) => of(Result.success(data.find(item => item.id === id)!)),
            deleteUserById: (id: number) =>
              timer(250).pipe(
                map(() => {
                  data = data.filter(item => item.id !== id)
                  return Result.success<void>(undefined)
                })
              ),
            updateUserById: vi.fn(),
            updateUserStatusById: vi.fn()
          }
        },
        { provide: ROLE_REPOSITORY, useValue: {} }
      ]
    })
  })
  async function records() {
    return data
  }
  async function setup() {
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    const users = TestBed.inject(UserStore),
      user = (await records())[0],
      deleted = vi.fn()
    const ref = TestBed.inject(HlmDialogService).open<void, DeleteUserContext>(DeleteUserDialog, {
      context: { user, onDeleted: deleted },
      showCloseButton: false,
      disableClose: true
    })
    await flush(fixture.whenStable())
    const element = document.querySelector<HTMLElement>("app-delete-user-dialog")!
    return {
      dialog: getDebugNode(element)!.injector.get(DeleteUserDialog),
      ref,
      users,
      user,
      deleted,
      element
    }
  }
  it("keeps the shared header first and its confirmation context unchanged", async () => {
    const { element } = await setup()
    const header = element.firstElementChild!
    expect(header.getAttribute("data-slot")).toBe("dialog-header")
    expect(header.querySelector('[data-slot="dialog-title"]')!.textContent).toBe("Eliminar usuario")
    expect(header.querySelector('[data-slot="dialog-description"]')!.textContent).toBe(
      "Esta acción elimina el perfil del usuario."
    )
    expect(header.querySelector('[data-slot="dialog-title"]')!.children).toHaveLength(0)
  })

  it.each(["backdrop", "outside", "escape"])(
    "closes on idle %s but not an inside click",
    async interaction => {
      const { dialog, ref, element, deleted, users } = await setup()
      const cdk = getDebugNode(element)!.injector.get(CdkDialogRef)
      expect(cdk.disableClose).toBe(true)
      const cancel = vi.spyOn(dialog, "cancel")
      element.querySelector("p")!.click()
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
      expect(await records()).toHaveLength(1)
      expect(deleted).not.toHaveBeenCalled()
    }
  )

  it.each(["success", "failure"])(
    "cancels pending deletion without late %s feedback",
    async outcome => {
      const { dialog, users, ref, element, deleted } = await setup()
      const response = new Subject<Result<void, UserError>>()
      vi.spyOn(users, "deleteUserById").mockReturnValue(response)
      const close = vi.spyOn(ref, "close")
      const pending = dialog.confirm()
      expect(response.observed).toBe(true)
      const setError = vi.spyOn(dialog.error, "set")
      getDebugNode(element)!.injector.get(CdkDialogRef).close()
      expect(response.observed).toBe(false)
      response.next(
        outcome === "success"
          ? Result.success(undefined)
          : Result.failure(new UserError("UNEXPECTED"))
      )
      response.complete()
      await pending
      expect(deleted).not.toHaveBeenCalled()
      expect(close).not.toHaveBeenCalled()
      expect(setError).not.toHaveBeenCalled()
      expect(dialog.submitting()).toBe(false)
    }
  )

  it("finalizes loading and preserves the target when destroyed during a real deletion", async () => {
    const { dialog, users, element, user, deleted } = await setup()
    const pending = dialog.confirm()
    expect(users.loading()).toBe(true)
    getDebugNode(element)!.injector.get(CdkDialogRef).close()
    await flush(pending)
    expect(users.loading()).toBe(false)
    expect((await records()).some(item => item.id === user.id)).toBe(true)
    expect(dialog.error()).toBe("")
    expect(deleted).not.toHaveBeenCalled()
  })

  it("settles empty completion without feedback and unlocks Cancel", async () => {
    const { dialog, users, ref, element, deleted } = await setup()
    vi.spyOn(users, "deleteUserById").mockReturnValue(EMPTY)
    await dialog.confirm()
    expect(dialog.error()).toBe("")
    expect(deleted).not.toHaveBeenCalled()
    expect(dialog.submitting()).toBe(false)
    TestBed.tick()
    element.querySelector<HTMLButtonElement>("#cancel-delete-user")!.click()
    await vi.runAllTimersAsync()
    expect(ref.state()).toBe("closed")
  })

  it("shows the target, cancels without deleting and deletes only after confirmed success", async () => {
    const { dialog, ref, users, user, element, deleted } = await setup()
    expect(element.textContent).toContain(user.name)
    expect(element.textContent).toContain(user.email)
    expect(element.textContent).toContain("Esta acción elimina el perfil del usuario.")
    expect(element.textContent).not.toMatch(/demo|demostración|en memoria|fictici/i)
    dialog.cancel()
    expect(await records()).toHaveLength(1)
    ref.forceClose()
    const next = await setup()
    await flush(next.dialog.confirm())
    expect(await records()).toHaveLength(0)
    expect(next.deleted).toHaveBeenCalledOnce()
    expect(next.ref.state()).toBe("closed")
    expect(deleted).not.toHaveBeenCalled()
    next.ref.forceClose()
  })
  it("prevents duplicate confirmations and preserves the target on failure", async () => {
    const { dialog, users, ref, deleted, element } = await setup()
    const response = new Subject<Result<void, UserError>>()
    const remove = vi.spyOn(users, "deleteUserById").mockReturnValue(response)
    const close = vi.spyOn(ref, "close")
    const pending = dialog.confirm()
    await dialog.confirm()
    dialog.cancel()
    expect(remove).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
    expect(dialog.submitting()).toBe(true)
    TestBed.tick()
    expect(element.querySelector<HTMLButtonElement>("#cancel-delete-user")!.disabled).toBe(true)
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
    expect(dialog.error()).toContain("No pudimos eliminar")
    expect(await records()).toHaveLength(1)
    expect(deleted).not.toHaveBeenCalled()
    expect(dialog.submitting()).toBe(false)
    TestBed.tick()
    expect(element.querySelector<HTMLButtonElement>("#cancel-delete-user")!.disabled).toBe(false)
    cdk.overlayRef.backdropElement!.click()
    await vi.runAllTimersAsync()
    expect(ref.state()).toBe("closed")
  })
})
