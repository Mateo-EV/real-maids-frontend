import { DialogRef as CdkDialogRef } from "@angular/cdk/dialog"
import { Component, DestroyRef, getDebugNode } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { of, Subject, throwError } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { RbacStore } from "../../state/rbac.store"
import { RbacMatrix } from "../../../domain/models/rbac-matrix"
import { RbacError } from "../../../domain/errors/rbac.error"
import {
  RolePermissionsConfirmation,
  RolePermissionsContext
} from "./role-permissions-confirmation"

@Component({ template: "" })
class TestHost {}

describe("RolePermissionsConfirmation", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  async function setup() {
    const save = vi.fn()
    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [{ provide: RbacStore, useValue: { savePermissions: save } }]
    })
    const fixture = TestBed.createComponent(TestHost)
    fixture.detectChanges()
    const saved = vi.fn()
    const ref = TestBed.inject(HlmDialogService).open<void, RolePermissionsContext>(
      RolePermissionsConfirmation,
      {
        context: {
          owner: fixture.componentRef.injector.get(DestroyRef),
          role: { id: 2, name: "Operaciones" },
          grants: [{ module: "crm", action: "read" }],
          changes: [{ module: "crm", action: "delete", granted: false }],
          onSaved: saved
        },
        disableClose: true,
        showCloseButton: false
      }
    )
    await vi.runAllTimersAsync()
    TestBed.tick()
    const element = document.querySelector<HTMLElement>("app-role-permissions-confirmation")!
    const injector = getDebugNode(element)!.injector
    return {
      fixture,
      ref,
      save,
      saved,
      element,
      dialog: injector.get(RolePermissionsConfirmation),
      cdk: injector.get(CdkDialogRef)
    }
  }
  it.each(["cancel", "backdrop", "outside", "escape"])(
    "allows idle %s without saving",
    async action => {
      const { dialog, cdk, element, ref, save } = await setup()
      expect(element.firstElementChild?.getAttribute("data-slot")).toBe("dialog-header")
      expect(element.textContent).toContain("Operaciones")
      expect(element.textContent).toContain("Retirar · 03. CRM & Embudo de Ventas · Eliminar (D)")
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
  it("blocks duplicates and pending dismissal, retries identical grants, and reports success only after operation", async () => {
    const { dialog, cdk, element, ref, save, saved } = await setup()
    const response = new Subject<Result<RbacMatrix, RbacError>>()
    save.mockReturnValueOnce(response).mockReturnValueOnce(
      of(
        Result.success({
          roleId: 2,
          configured: true,
          grants: [{ module: "crm", action: "read" }]
        })
      )
    )
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
    expect(save).toHaveBeenCalledOnce()
    expect(saved).not.toHaveBeenCalled()
    response.next(Result.failure(new RbacError("UNEXPECTED")))
    response.complete()
    await pending
    expect(dialog.error()).toContain("Inténtalo de nuevo")
    expect(saved).not.toHaveBeenCalled()
    await dialog.confirm()
    expect(save.mock.calls).toEqual([
      [2, [{ module: "crm", action: "read" }]],
      [2, [{ module: "crm", action: "read" }]]
    ])
    expect(saved).toHaveBeenCalledOnce()
    expect(ref.state()).toBe("closed")
  })
  it("shows thrown errors and allows cancellation after failure", async () => {
    const { dialog, save, saved, ref } = await setup()
    save.mockReturnValue(throwError(() => new Error("offline")))
    await dialog.confirm()
    expect(dialog.error()).toContain("No pudimos guardar")
    expect(dialog.submitting()).toBe(false)
    expect(saved).not.toHaveBeenCalled()
    dialog.cancel()
    await vi.runAllTimersAsync()
    expect(ref.state()).toBe("closed")
  })
  it("immediately cancels pending save when owner is destroyed and suppresses late feedback", async () => {
    const { fixture, dialog, save, saved, ref } = await setup()
    const response = new Subject<Result<RbacMatrix, RbacError>>()
    save.mockReturnValue(response)
    const pending = dialog.confirm()
    fixture.destroy()
    expect(response.observed).toBe(false)
    await pending
    response.next(Result.success({ roleId: 2, configured: true, grants: [] }))
    expect(saved).not.toHaveBeenCalled()
    ref.close()
    await vi.runAllTimersAsync()
  })
})
