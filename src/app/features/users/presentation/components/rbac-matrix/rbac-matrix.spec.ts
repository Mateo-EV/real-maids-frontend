import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { of, Subject } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { RolesStore } from "../../state/roles.store"
import { RBAC_REPOSITORY } from "../../../domain/repositories/rbac.repository"
import { PermissionAssignment } from "../../../domain/entities/permission.entity"
import { RbacError } from "../../../domain/errors/rbac.error"
import { HotToastService } from "@ngxpert/hot-toast"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { RbacMatrix } from "./rbac-matrix"
const permission = {
  id: 73,
  code: "BACKEND_CUSTOM",
  module: "Inventario",
  description: "Acción documentada"
}
function setup(assigned = [permission]) {
  const query = vi
    .fn()
    .mockImplementation((roleId: number) => of(Result.success({ roleId, permissions: assigned })))
  const catalog = vi
    .fn()
    .mockReturnValue(of(Result.success([permission, { ...permission, id: 0, code: "OTHER" }])))
  const dialogs = { open: vi.fn().mockReturnValue({ closed$: new Subject(), close: vi.fn() }) }
  const toast = { success: vi.fn() }
  TestBed.configureTestingModule({
    imports: [RbacMatrix],
    providers: [
      {
        provide: RolesStore,
        useValue: {
          roles: signal([
            { id: 19, name: "Rol real", isActive: true },
            { id: 23, name: "Otro", isActive: true }
          ])
        }
      },
      {
        provide: RBAC_REPOSITORY,
        useValue: {
          getPermissions: catalog,
          getRolePermissions: query,
          saveRolePermissions: vi.fn()
        }
      },
      { provide: HlmDialogService, useValue: dialogs },
      { provide: HotToastService, useValue: toast }
    ]
  })
  const fixture = TestBed.createComponent(RbacMatrix)
  fixture.detectChanges()
  return {
    fixture,
    component: fixture.componentInstance,
    query,
    catalog,
    dialogs,
    toast,
    element: fixture.nativeElement as HTMLElement
  }
}
describe("dynamic permission editor", () => {
  it("renders backend modules, descriptions and codes, not fixed CRUD columns or invented role IDs", () => {
    const { element, query, catalog } = setup()
    expect(catalog).toHaveBeenCalledOnce()
    expect(query).toHaveBeenCalledWith(19)
    expect(element.textContent).toContain("Inventario")
    expect(element.textContent).toContain("BACKEND_CUSTOM")
    expect(element.textContent).toContain("Acción documentada")
    expect(element.textContent).not.toContain("Alcance / Reglas")
    expect(element.querySelector('[role="checkbox"][aria-label*="BACKEND_CUSTOM"]')).not.toBeNull()
  })
  it("preserves assigned IDs missing from the catalog, including removal to empty", () => {
    const extra = { ...permission, id: 99, code: "LEGACY_BACKEND", module: "Otro módulo" }
    const { component, element, dialogs } = setup([extra])
    expect(element.textContent).toContain("LEGACY_BACKEND")
    expect(element.textContent).toContain("ausente del catálogo")
    expect(component.ids()).toEqual([99])
    component.toggle(99, false)
    component.confirmSave()
    expect(dialogs.open.mock.calls[0][1].context.ids).toEqual([])
    expect(dialogs.open.mock.calls[0][1].context.changes).toEqual([
      { code: "LEGACY_BACKEND", module: "Otro módulo", granted: false }
    ])
    component.selectRole("23")
    component.toggle(73, true)
    component.confirmSave()
    expect(component.selectedRoleId()).toBe(19)
    expect(component.ids()).toEqual([])
    expect(dialogs.open).toHaveBeenCalledOnce()
  })
  it("keeps the draft/identity on failures, cancels superseded loads and ignores stale responses", () => {
    const { component, query, fixture } = setup()
    component.toggle(0, true)
    const first = new Subject<Result<PermissionAssignment, RbacError>>()
    const second = new Subject<Result<PermissionAssignment, RbacError>>()
    query.mockReturnValueOnce(first).mockReturnValueOnce(second)
    component.selectRole("23")
    expect(component.loadedRoleId()).toBe(19)
    expect(component.ids()).toEqual([73, 0])
    expect(component.canSave()).toBe(false)
    component.toggle(73, false)
    component.selectRole("19")
    expect(first.observed).toBe(false)
    first.next(Result.success({ roleId: 23, permissions: [] }))
    first.complete()
    second.next(Result.failure(new RbacError("FORBIDDEN")))
    second.complete()
    expect(component.loadedRoleId()).toBe(19)
    expect(component.ids()).toEqual([73, 0])
    expect(component.error()).not.toBe("")
    component.retry()
    expect(component.error()).toBe("")
    expect(component.dirty()).toBe(false)
    const cancelled = new Subject<never>()
    query.mockReturnValueOnce(cancelled)
    component.retry()
    fixture.destroy()
    expect(cancelled.observed).toBe(false)
  })
  it("edits backend-empty assignments with labeled Signal Forms and toasts only after save", () => {
    const { component, element, fixture, dialogs, toast } = setup([])
    expect(element.textContent).toContain("no tiene permisos asignados")
    expect(component.canSave()).toBe(false)
    element.querySelector<HTMLElement>('[role="checkbox"][aria-label*="BACKEND_CUSTOM"]')!.click()
    fixture.detectChanges()
    expect(component.ids()).toEqual([73])
    component.confirmSave()
    expect(toast.success).not.toHaveBeenCalled()
    const context = dialogs.open.mock.calls[0][1].context
    expect(context.ids).toEqual([73])
    context.onSaved({ roleId: 23, permissions: [] })
    expect(toast.success).not.toHaveBeenCalled()
    context.onSaved({ roleId: 19, permissions: [permission] })
    expect(component.dirty()).toBe(false)
    expect(toast.success).toHaveBeenCalledExactlyOnceWith("Permisos guardados")
  })
  it("preserves the current draft when the catalog fails", () => {
    const { component, catalog } = setup()
    component.toggle(0, true)
    catalog.mockReturnValueOnce(of(Result.failure(new RbacError("NETWORK"))))
    component.retry()
    expect(component.ids()).toEqual([73, 0])
    expect(component.canSave()).toBe(false)
    expect(component.error()).not.toBe("")
  })
})
