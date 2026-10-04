import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from "@angular/core"
import { form, FormField, FormRoot, required, submit, validate } from "@angular/forms/signals"
import { firstValueFrom } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { Role } from "../../../domain/entities/role.entity"
import { RoleError } from "../../../domain/errors/role.error"
import { RolesStore } from "../../state/roles.store"

export interface RoleCatalogContext { onChanged: () => void }
const emptyRole = () => ({ name: "", description: "", isActive: true })

@Component({
  selector: "app-role-catalog", changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormField, FormRoot, HlmDialogImports, HlmButtonImports, HlmFieldImports, HlmInputImports,
    HlmTextareaImports, HlmBadgeImports, HlmAlertImports, HlmSpinnerImports],
  templateUrl: "./role-catalog.html",
  styleUrl: "./role-catalog.css"
})
export class RoleCatalog {
  readonly roles = inject(RolesStore)
  private readonly dialog = inject(BrnDialogRef)
  private readonly context = injectBrnDialogContext<RoleCatalogContext>()
  private readonly nameInput = viewChild<ElementRef<HTMLInputElement>>("nameInput")
  readonly editingId = signal<number | null>(null)
  readonly deleteTarget = signal<Role | null>(null)
  readonly error = signal("")
  readonly success = signal("")
  readonly mutating = signal(false)
  readonly model = signal(emptyRole())
  readonly roleForm = form(this.model, path => {
    required(path.name, { message: "Ingresa el nombre del rol." })
    validate(path.name, ({ value }) => value().trim() ? undefined : { kind: "required", message: "Ingresa el nombre del rol." })
  })
  readonly busy = computed(() => this.roleForm().submitting() || this.mutating())

  edit(role: Role): void {
    if (this.busy()) return
    this.editingId.set(role.id)
    this.deleteTarget.set(null)
    this.error.set("")
    this.roleForm().reset({ name: role.name, description: role.description, isActive: role.isActive })
    this.nameInput()?.nativeElement.focus()
  }

  discard(): void {
    if (this.busy()) return
    this.editingId.set(null)
    this.roleForm().reset(emptyRole())
    this.error.set("")
  }

  save(): Promise<boolean> {
    if (this.busy()) return Promise.resolve(false)
    this.error.set("")
    this.success.set("")
    return submit(this.roleForm, async () => {
      const params = { ...this.model(), name: this.model().name.trim(), description: this.model().description.trim() }
      try {
        const id = this.editingId()
        const result = await firstValueFrom(id === null ? this.roles.createRole(params) : this.roles.updateRoleById(id, params))
        if (!result.success) this.showError(result.error)
        else {
          this.editingId.set(null)
          this.roleForm().reset(emptyRole())
          this.changed("Rol guardado.")
        }
      } catch { this.error.set("No pudimos guardar el rol. Inténtalo de nuevo.") }
      return undefined
    })
  }

  async toggle(role: Role): Promise<void> {
    if (this.busy()) return
    this.mutating.set(true)
    this.error.set("")
    try {
      const result = await firstValueFrom(this.roles.updateRoleById(role.id, { name: role.name, description: role.description, isActive: !role.isActive }))
      if (!result.success) this.showError(result.error)
      else this.changed("Estado del rol actualizado. Las asignaciones existentes se conservan.")
    } catch { this.error.set("No pudimos actualizar el rol.") }
    finally { this.mutating.set(false) }
  }

  requestDelete(role: Role): void {
    if (!this.busy()) { this.deleteTarget.set(role); this.error.set("") }
  }

  async confirmDelete(): Promise<void> {
    const target = this.deleteTarget()
    if (!target || this.busy()) return
    this.mutating.set(true)
    this.error.set("")
    try {
      const result = await firstValueFrom(this.roles.deleteRoleById(target.id))
      if (!result.success) this.showError(result.error)
      else {
        this.deleteTarget.set(null)
        if (this.editingId() === target.id) { this.editingId.set(null); this.roleForm().reset(emptyRole()) }
        this.changed("Rol eliminado.")
      }
    } catch { this.error.set("No pudimos eliminar el rol.") }
    finally { this.mutating.set(false) }
  }

  cancelDelete(): void { if (!this.busy()) this.deleteTarget.set(null) }
  close(): void { if (!this.busy()) this.dialog.close() }

  private changed(message: string): void { this.success.set(message); this.context.onChanged() }
  private showError(error: RoleError): void {
    this.error.set(error.code === "ROLE_IN_USE"
      ? "Este rol está asignado a un usuario (activo o inactivo). Reasigna los usuarios antes de eliminarlo; puedes desactivarlo conservando las asignaciones."
      : error.code === "ROLE_NOT_FOUND" ? "El rol ya no existe." : "No pudimos completar la operación. Inténtalo de nuevo.")
  }
}
