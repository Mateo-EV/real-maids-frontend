import { Component, getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { describe, expect, it, vi, beforeEach } from "vitest"
import { Subject } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { UserError } from "../../../domain/errors/user.error"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { USER_REPOSITORY } from "../../../domain/repositories/user.repository"
import { ROLE_REPOSITORY } from "../../../domain/repositories/role.repository"
import { UserInMemorySource } from "../../../infrastructure/source/user-in-memory.source"
import { RoleInMemorySource } from "../../../infrastructure/source/role-in-memory.source"
import { UserStore } from "../../state/user.store"
import { UsersDemoInitializer } from "../../demo/users-demo-initializer"
import { DeleteUserContext, DeleteUserDialog } from "./delete-user-dialog"

@Component({ template: "" })
class TestHost {}

describe("DeleteUserDialog", () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [TestHost], providers: [
    { provide: USER_REPOSITORY, useExisting: UserInMemorySource }, { provide: ROLE_REPOSITORY, useExisting: RoleInMemorySource }
  ] }))
  async function setup() {
    await TestBed.inject(UsersDemoInitializer).initialize()
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    const users = TestBed.inject(UserStore), user = users.users()[0], deleted = vi.fn()
    const ref = TestBed.inject(HlmDialogService).open<void, DeleteUserContext>(DeleteUserDialog, { context: { user, onDeleted: deleted }, showCloseButton: false })
    await fixture.whenStable()
    const element = document.querySelector<HTMLElement>("app-delete-user-dialog")!
    return { dialog: getDebugNode(element)!.injector.get(DeleteUserDialog), ref, users, user, deleted, element }
  }
  it("shows the target, cancels without deleting and deletes only after confirmed success", async () => {
    const { dialog, ref, users, user, element, deleted } = await setup()
    expect(element.textContent).toContain(user.name)
    expect(element.textContent).toContain(user.email)
    expect(element.textContent).toContain("Esta acción elimina el perfil del usuario.")
    expect(element.textContent).not.toMatch(/demo|demostración|en memoria|fictici/i)
    dialog.cancel()
    expect(users.users()).toHaveLength(48)
    ref.forceClose()
    const next = await setup()
    await next.dialog.confirm()
    expect(next.users.users()).toHaveLength(47)
    expect(next.deleted).toHaveBeenCalledOnce()
    expect(deleted).not.toHaveBeenCalled()
    next.ref.forceClose()
  })
  it("prevents duplicate confirmations and preserves the target on failure", async () => {
    const { dialog, users, ref, deleted } = await setup()
    const response = new Subject<Result<void, UserError>>()
    const remove = vi.spyOn(users, "deleteUserById").mockReturnValue(response)
    const close = vi.spyOn(ref, "close")
    const pending = dialog.confirm()
    await dialog.confirm()
    dialog.cancel()
    expect(remove).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
    expect(dialog.submitting()).toBe(true)
    response.next(Result.failure(new UserError("UNEXPECTED"))); response.complete()
    await pending
    expect(dialog.error()).toContain("No pudimos eliminar")
    expect(users.users()).toHaveLength(48)
    expect(deleted).not.toHaveBeenCalled()
    expect(dialog.submitting()).toBe(false)
    ref.forceClose()
  })
})
