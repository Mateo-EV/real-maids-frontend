import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { Component, DestroyRef, getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { of, Subject } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { RbacStore } from "../../state/rbac.store"
import { PermissionAssignment } from "../../../domain/entities/permission.entity"
import { RbacError } from "../../../domain/errors/rbac.error"
import { RbacSaveConfirmation, RbacSaveContext } from "./rbac-save-confirmation"
@Component({ template: "" })
class TestHost {}
describe("RbacSaveConfirmation", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  async function setup() {
    const save = vi.fn()
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [{ provide: RbacStore, useValue: { savePermissionIds: save } }]
    })
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    const saved = vi.fn()
    const ref = TestBed.inject(HlmDialogService).open<void, RbacSaveContext>(RbacSaveConfirmation, {
      context: {
        owner: fixture.componentRef.injector.get(DestroyRef),
        role: { id: 19, name: "Rol real" },
        ids: [],
        changes: [{ code: "CUSTOM", module: "Backend", granted: false }],
        onSaved: saved
      },
      disableClose: true,
      showCloseButton: false
    })
    await vi.runAllTimersAsync()
    TestBed.tick()
    const element = document.querySelector<HTMLElement>("app-rbac-save-confirmation")!
    const injector = getDebugNode(element)!.injector
    return {
      fixture,
      ref,
      save,
      saved,
      element,
      dialog: injector.get(RbacSaveConfirmation),
      cdk: injector.get(CdkDialogRef)
    }
  }
  it.each(["cancel", "backdrop", "outside", "escape"])(
    "allows idle %s without mutation",
    async action => {
      const { dialog, cdk, element, ref, save } = await setup()
      expect(element.firstElementChild?.getAttribute("data-slot")).toBe("dialog-header")
      expect(element.textContent).toContain("Rol real")
      expect(element.textContent).toContain("El rol quedará sin permisos")
      if (action === "cancel") dialog.cancel()
      else if (action === "backdrop") cdk.overlayRef.backdropElement!.click()
      else if (action === "outside") document.body.click()
      else
        element.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
        )
      await vi.runAllTimersAsync()
      expect(ref.state()).toBe("closed")
      expect(save).not.toHaveBeenCalled()
    }
  )
  it("blocks duplicates and dismissal, preserves IDs after 403 and retries only explicitly", async () => {
    const { dialog, cdk, element, ref, save, saved } = await setup()
    const response = new Subject<Result<PermissionAssignment, RbacError>>()
    save
      .mockReturnValueOnce(response)
      .mockReturnValueOnce(of(Result.success({ roleId: 19, permissions: [] })))
    const pending = dialog.confirm()
    await dialog.confirm()
    dialog.cancel()
    cdk.overlayRef.backdropElement!.click()
    document.body.click()
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true })
    )
    TestBed.tick()
    expect(element.querySelectorAll("button:disabled")).toHaveLength(2)
    expect(element.querySelector("hlm-spinner")).not.toBeNull()
    expect(ref.state()).toBe("open")
    expect(save).toHaveBeenCalledExactlyOnceWith(19, [])
    expect(saved).not.toHaveBeenCalled()
    response.next(Result.failure(new RbacError("FORBIDDEN")))
    response.complete()
    await pending
    expect(dialog.error()).toContain("borrador se conserva")
    expect(saved).not.toHaveBeenCalled()
    await dialog.confirm()
    expect(save.mock.calls).toEqual([
      [19, []],
      [19, []]
    ])
    expect(saved).toHaveBeenCalledOnce()
    expect(ref.state()).toBe("closed")
  })
  it("rejects wrong role identity and suppresses callbacks after owner destruction", async () => {
    const { fixture, dialog, save, saved, ref } = await setup()
    save.mockReturnValueOnce(of(Result.success({ roleId: 23, permissions: [] })))
    await dialog.confirm()
    expect(dialog.error()).not.toBe("")
    expect(saved).not.toHaveBeenCalled()
    const pending = new Subject<Result<PermissionAssignment, RbacError>>()
    save.mockReturnValueOnce(pending)
    const confirmation = dialog.confirm()
    fixture.destroy()
    expect(pending.observed).toBe(false)
    await confirmation
    pending.next(Result.success({ roleId: 19, permissions: [] }))
    expect(saved).not.toHaveBeenCalled()
    ref.close()
    await vi.runAllTimersAsync()
  })
})
