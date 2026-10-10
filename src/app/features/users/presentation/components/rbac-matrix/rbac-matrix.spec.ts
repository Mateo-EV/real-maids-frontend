import { signal } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { of, Subject } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { RolesStore } from "../../state/roles.store"
import { RBAC_REPOSITORY } from "../../../domain/repositories/rbac.repository"
import { RbacMatrix as Matrix } from "../../../domain/models/rbac-matrix"
import { RbacError } from "../../../domain/errors/rbac.error"
import { HotToastService } from "@ngxpert/hot-toast"
import { HlmDialogService } from "@spartan-ng/helm/dialog"
import { RbacMatrix } from "./rbac-matrix"

describe("RbacMatrix", () => {
  const operations: Matrix = {
    roleId: 2,
    configured: true,
    grants: [{ module: "crm", action: "read" }]
  }
  function setup() {
    const query = vi.fn().mockReturnValue(of(Result.success(operations)))
    const toast = { success: vi.fn() }
    const dialogs = { open: vi.fn().mockReturnValue({ closed$: new Subject(), close: vi.fn() }) }
    TestBed.configureTestingModule({
      imports: [RbacMatrix],
      providers: [
        {
          provide: RolesStore,
          useValue: {
            roles: signal([
              { id: 1, name: "Administración", isActive: true },
              { id: 2, name: "Operaciones", isActive: true }
            ])
          }
        },
        {
          provide: RBAC_REPOSITORY,
          useValue: { getRolePermissions: query, saveRolePermissions: vi.fn() }
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
      dialogs,
      toast,
      element: fixture.nativeElement as HTMLElement
    }
  }
  it("groups title, labeled role selection and save in one responsive header with explicit action headings", () => {
    const { element } = setup()
    const header = element.querySelector("header")!
    expect(header).not.toBeNull()
    expect(header.querySelector("#rbac-title")).not.toBeNull()
    expect(header.querySelector(".catalog-filter-row #rbac-role")).not.toBeNull()
    expect(header.querySelector('label[for="rbac-role"]')?.textContent).toContain(
      "Editar permisos para"
    )
    expect(header.querySelector(".catalog-filter-row > button")?.textContent).toContain(
      "Guardar Matriz"
    )
    expect(Array.from(element.querySelectorAll("thead th"), th => th.textContent?.trim())).toEqual([
      "Módulo Funcional",
      "Ver / Lectura (R)",
      "Crear (C)",
      "Editar (U)",
      "Eliminar (D)",
      "Exportar / Sinc.",
      "Alcance / Reglas"
    ])
  })
  it("renders seven rows, labeled mobile choices and reference rules; saves only through confirmation", () => {
    const { component, fixture, element, dialogs } = setup()
    fixture.detectChanges()
    expect(element.querySelectorAll("tr[data-module]")).toHaveLength(7)
    expect(element.querySelectorAll("fieldset[data-module]")).toHaveLength(7)
    expect(element.textContent).toContain("Solo usuarios de su área")
    component.toggle("crm", "delete", true)
    component.confirmSave()
    expect(dialogs.open).toHaveBeenCalledTimes(1)
    const context = dialogs.open.mock.calls[0][1].context
    expect(context.role.id).toBe(2)
    expect(context.changes).toEqual([{ module: "crm", action: "delete", granted: true }])
    component.selectRole("1")
    component.confirmSave()
    expect(component.selectedRoleId()).toBe(2)
    expect(dialogs.open).toHaveBeenCalledTimes(1)
  })
  it("preserves the displayed role/draft until query success, prevents saving under the requested role and ignores stale responses", () => {
    const { component, query, fixture } = setup()
    component.toggle("crm", "create", true)
    const first = new Subject<Result<Matrix, RbacError>>()
    const second = new Subject<Result<Matrix, RbacError>>()
    query.mockReturnValueOnce(first).mockReturnValueOnce(second)
    component.selectRole("1")
    expect(component.loadedRoleId()).toBe(2)
    expect(component.grants()).toHaveLength(2)
    expect(component.canSave()).toBe(false)
    component.selectRole("2")
    first.next(Result.success({ roleId: 1, configured: false, grants: [] }))
    expect(component.loadedRoleId()).toBe(2)
    second.next(Result.failure(new RbacError("UNEXPECTED")))
    expect(component.grants()).toHaveLength(2)
    expect(component.error()).not.toBe("")
    query.mockReturnValue(of(Result.success({ roleId: 1, configured: false, grants: [] })))
    component.selectRole("1")
    expect(component.loadedRoleId()).toBe(1)
    expect(component.grants()).toEqual([])
    fixture.destroy()
  })
  it("edits unconfigured roles through labeled Signal Forms choices and shows success only from the save callback", () => {
    const { component, query, fixture, element, dialogs, toast } = setup()
    query.mockReturnValue(of(Result.success({ roleId: 1, configured: false, grants: [] })))
    component.selectRole("1")
    fixture.detectChanges()
    expect(element.textContent).toContain("Rol sin configurar")
    expect(element.textContent).toContain("Sin reglas configuradas")
    expect(element.textContent).not.toContain("Solo usuarios de su área")
    const checkbox = element.querySelector<HTMLElement>(
      'fieldset[data-module="crm"] [role="checkbox"][aria-label$="Crear (C)"]'
    )!
    expect(checkbox).not.toBeNull()
    checkbox.click()
    fixture.detectChanges()
    expect(component.grants()).toEqual([{ module: "crm", action: "create" }])
    component.confirmSave()
    expect(toast.success).not.toHaveBeenCalled()
    const context = dialogs.open.mock.calls[0][1].context
    context.onSaved({ roleId: 1, configured: true, grants: context.grants })
    expect(toast.success).toHaveBeenCalledExactlyOnceWith("Permisos guardados")
    expect(component.dirty()).toBe(false)
  })

  it("cancels queries on destruction", () => {
    const { component, query, fixture } = setup()
    const pending = new Subject<Result<Matrix, RbacError>>()
    query.mockReturnValue(pending)
    component.selectRole("1")
    fixture.destroy()
    expect(pending.observed).toBe(false)
    pending.next(Result.success({ roleId: 1, configured: false, grants: [] }))
    expect(component.loadedRoleId()).toBe(2)
  })
})
