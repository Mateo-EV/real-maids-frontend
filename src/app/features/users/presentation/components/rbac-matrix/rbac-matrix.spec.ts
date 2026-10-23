import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { of, Subject } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { RolesStore } from "../../state/roles.store"
import { RBAC_REPOSITORY } from "../../../domain/repositories/rbac.repository"
import { Permission, PermissionAssignment } from "../../../domain/entities/permission.entity"
import { RbacError } from "../../../domain/errors/rbac.error"
import { HotToastService } from "@ngxpert/hot-toast"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { RbacMatrix } from "./rbac-matrix"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
const permission = {
  id: 73,
  code: "BACKEND_CUSTOM",
  module: "Inventario",
  description: "Acción documentada"
}
function setup(
  assigned = [permission],
  initial?: {
    catalog: Subject<Result<Permission[], RbacError>>
    assignment: Subject<Result<PermissionAssignment, RbacError>>
  }
) {
  const auth = {
    session: signal<AuthSession | null>(AuthSession.create("Tester", "tester@example.test"))
  }
  const changes = new Subject<AuthSession | null>()
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
      { provide: AuthStore, useValue: auth },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => changes } },
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
  if (initial) {
    catalog.mockReturnValueOnce(initial.catalog)
    query.mockReturnValueOnce(initial.assignment)
  }
  const fixture = TestBed.createComponent(RbacMatrix)
  fixture.componentRef.setInput("active", true)
  fixture.detectChanges()
  return {
    fixture,
    component: fixture.componentInstance,
    auth,
    changes,
    query,
    catalog,
    dialogs,
    toast,
    element: fixture.nativeElement as HTMLElement
  }
}
describe("dynamic permission editor", () => {
  it("keeps one initial async load subscribed and refreshes only on a hidden-to-visible edge", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    try {
      const initial = {
        catalog: new Subject<Result<Permission[], RbacError>>(),
        assignment: new Subject<Result<PermissionAssignment, RbacError>>()
      }
      const { fixture, component, catalog, query } = setup([permission], initial)
      fixture.detectChanges()
      expect.soft(catalog).toHaveBeenCalledTimes(1)
      expect.soft(query).toHaveBeenCalledTimes(1)
      expect.soft(initial.catalog.observed).toBe(true)
      expect(initial.assignment.observed).toBe(true)
      initial.catalog.next(Result.success([permission, { ...permission, id: 0, code: "OTHER" }]))
      initial.catalog.complete()
      initial.assignment.next(Result.success({ roleId: 19, permissions: [permission] }))
      initial.assignment.complete()
      component.toggle(0, true)
      fixture.componentRef.setInput("active", false)
      fixture.detectChanges()
      now.mockReturnValue(31000)
      expect(query).toHaveBeenCalledTimes(1)
      const refresh = new Subject<Result<PermissionAssignment, RbacError>>()
      query.mockReturnValueOnce(refresh)
      fixture.componentRef.setInput("active", true)
      fixture.detectChanges()
      expect(query).toHaveBeenCalledTimes(2)
      expect(refresh.observed).toBe(true)
      fixture.componentRef.setInput("active", true)
      fixture.detectChanges()
      expect(query).toHaveBeenCalledTimes(2)
      expect(refresh.observed).toBe(true)
      refresh.next(Result.success({ roleId: 19, permissions: [] }))
      refresh.complete()
      expect(component.selectedRoleId()).toBe(19)
      expect(component.ids()).toEqual([73, 0])
      expect(component.dirty()).toBe(true)
      now.mockReturnValue(61000)
      fixture.componentRef.setInput("active", true)
      fixture.detectChanges()
      expect(query).toHaveBeenCalledTimes(2)
    } finally {
      now.mockRestore()
    }
  })
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
    // Returning within TTL is a cache hit; explicit retry exercises the failed network read.
    component.retry()
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
    expect(component.dirty()).toBe(true)
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
  it("revalidates only on active revisits and preserves a dirty draft through assignment changes", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1000)
    try {
      const { component, fixture, query, catalog } = setup()
      component.toggle(0, true)
      fixture.componentRef.setInput("active", false)
      fixture.detectChanges()
      now.mockReturnValue(31000)
      expect(query).toHaveBeenCalledTimes(1)
      query.mockReturnValueOnce(of(Result.success({ roleId: 19, permissions: [] })))
      catalog.mockReturnValueOnce(of(Result.success([])))
      fixture.componentRef.setInput("active", true)
      fixture.detectChanges()
      expect(query).toHaveBeenCalledTimes(2)
      expect(component.selectedRoleId()).toBe(19)
      expect(component.ids()).toEqual([73, 0])
      expect(component.dirty()).toBe(true)
    } finally {
      now.mockRestore()
    }
  })
  it("clears the session-old draft and permits recreation against a later session revision", () => {
    const { component, fixture, auth, changes } = setup()
    component.toggle(0, true)
    auth.session.set(null)
    changes.next(null)
    fixture.detectChanges()
    expect(component.loaded()).toBeUndefined()
    expect(component.ids()).toEqual([])
    const replacement = AuthSession.create("Other", "other@example.test")
    auth.session.set(replacement)
    changes.next(replacement)
    fixture.destroy()
    const next = TestBed.createComponent(RbacMatrix)
    next.detectChanges()
    expect(next.componentInstance.loadedRoleId()).toBe(19)
    expect(next.componentInstance.ids()).toEqual([73])
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
