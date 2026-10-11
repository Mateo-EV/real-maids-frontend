import { Component, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { firstValueFrom } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { PermissionAssignment } from "../../../domain/entities/permission.entity"
import { RbacStore } from "../../state/rbac.store"
import { connectUserDialogDismissal } from "../user-dialog-dismissal"
export interface RbacSaveContext {
  owner: DestroyRef
  role: { id: number; name: string }
  ids: number[]
  changes: { code: string; module: string; granted: boolean }[]
  onSaved: (assignment: PermissionAssignment) => void
}
@Component({
  selector: "app-rbac-save-confirmation",
  imports: [HlmDialogImports, HlmButtonImports, HlmAlertImports, HlmSpinnerImports],
  template: `
    <hlm-dialog-header
      ><h2 hlmDialogTitle>Guardar permisos</h2>
      <p hlmDialogDescription>
        Reemplaza el conjunto completo de permisos del rol.
      </p></hlm-dialog-header
    >
    <p class="my-4 font-semibold">{{ context.role.name }} · #{{ context.role.id }}</p>
    <ul class="flex flex-col gap-2 text-sm">
      @for (change of context.changes; track change.code) {
        <li>
          {{ change.granted ? "Conceder" : "Retirar" }} · {{ change.module }} · {{ change.code }}
        </li>
      }
    </ul>
    @if (context.ids.length === 0) {
      <p>El rol quedará sin permisos.</p>
    }
    @if (error()) {
      <div hlmAlert variant="destructive" role="alert" class="my-4">
        <p hlmAlertTitle>No se guardaron los permisos</p>
        <p hlmAlertDescription>{{ error() }}</p>
      </div>
    }
    <hlm-dialog-footer class="mt-4"
      ><button
        id="cancel-role-permissions"
        hlmBtn
        variant="outline"
        type="button"
        [disabled]="submitting()"
        (click)="cancel()"
      >
        Cancelar
      </button>
      <button
        hlmBtn
        type="button"
        [disabled]="submitting()"
        [attr.aria-busy]="submitting()"
        (click)="confirm()"
      >
        @if (submitting()) {
          <hlm-spinner aria-label="Guardando permisos" />
        }
        Confirmar guardar
      </button></hlm-dialog-footer
    >
  `
})
export class RbacSaveConfirmation {
  readonly context = injectBrnDialogContext<RbacSaveContext>()
  private readonly ref = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(RbacStore)
  private readonly ids = [...this.context.ids]
  readonly submitting = signal(false)
  readonly error = signal("")
  constructor() {
    connectUserDialogDismissal(this.destroyRef, () => this.cancel())
  }
  async confirm(): Promise<void> {
    if (this.destroyRef.destroyed || this.context.owner.destroyed || this.submitting()) return
    this.submitting.set(true)
    this.error.set("")
    try {
      const result = await firstValueFrom(
        this.store
          .savePermissionIds(this.context.role.id, this.ids)
          .pipe(takeUntilDestroyed(this.destroyRef), takeUntilDestroyed(this.context.owner)),
        { defaultValue: undefined }
      )
      if (!result || this.destroyRef.destroyed || this.context.owner.destroyed) return
      if (result.success && result.data.roleId === this.context.role.id) {
        this.context.onSaved(result.data)
        this.ref.close()
      } else
        this.error.set(
          !result.success && result.error.code === "FORBIDDEN"
            ? "El backend no permite este cambio. El borrador se conserva. Revisa las restricciones del rol ADMINISTRADOR, del rol propio y de los permisos que puedes conceder."
            : "No pudimos confirmar los permisos. El borrador se conserva; reintenta o cierra y recarga."
        )
    } catch {
      if (!this.destroyRef.destroyed)
        this.error.set("No pudimos confirmar los permisos. El borrador se conserva.")
    } finally {
      this.submitting.set(false)
    }
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.submitting() && this.ref.open) this.ref.close()
  }
}
