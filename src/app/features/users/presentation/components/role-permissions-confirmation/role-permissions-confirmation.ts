import { Component, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { firstValueFrom } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import {
  RbacGrant,
  RbacMatrix,
  RBAC_MODULES,
  RBAC_ACTIONS
} from "../../../domain/models/rbac-matrix"
import { RbacStore } from "../../state/rbac.store"
import { connectUserDialogDismissal } from "../user-dialog-dismissal"

export interface RolePermissionsContext {
  owner: DestroyRef
  role: { id: number; name: string }
  grants: RbacGrant[]
  changes: (RbacGrant & { granted: boolean })[]
  onSaved: (matrix: RbacMatrix) => void
}

@Component({
  selector: "app-role-permissions-confirmation",
  imports: [HlmDialogImports, HlmButtonImports, HlmAlertImports, HlmSpinnerImports],
  template: `
    <hlm-dialog-header>
      <h2 hlmDialogTitle>Guardar permisos</h2>
      <p hlmDialogDescription>Confirma los cambios para el rol seleccionado.</p>
    </hlm-dialog-header>
    <p class="my-4 font-semibold">{{ context.role.name }} · #{{ context.role.id }}</p>
    <ul class="flex flex-col gap-2 text-sm">
      @for (change of context.changes; track change.module + ":" + change.action) {
        <li>
          {{ change.granted ? "Conceder" : "Retirar" }} · {{ moduleLabel(change.module) }} ·
          {{ actionLabel(change.action) }}
        </li>
      } @empty {
        <li>Configurar el rol sin permisos concedidos.</li>
      }
    </ul>
    @if (error()) {
      <div hlmAlert variant="destructive" role="alert" class="my-4">
        <p hlmAlertTitle>No se guardaron los permisos</p>
        <p hlmAlertDescription>{{ error() }}</p>
      </div>
    }
    <hlm-dialog-footer class="mt-4 border-t pt-3">
      <button
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
        {{ submitting() ? "Guardando…" : error() ? "Reintentar guardar" : "Confirmar guardar" }}
      </button>
    </hlm-dialog-footer>
  `
})
export class RolePermissionsConfirmation {
  readonly context = injectBrnDialogContext<RolePermissionsContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(RbacStore)
  private readonly grants = this.context.grants.map(g => ({ ...g }))
  readonly submitting = signal(false)
  readonly error = signal("")
  readonly moduleLabel = (id: string) => RBAC_MODULES.find(m => m.id === id)?.label
  readonly actionLabel = (id: string) => RBAC_ACTIONS.find(a => a.id === id)?.label
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
          .savePermissions(this.context.role.id, this.grants)
          .pipe(takeUntilDestroyed(this.destroyRef), takeUntilDestroyed(this.context.owner)),
        { defaultValue: undefined }
      )
      if (!result || this.destroyRef.destroyed || this.context.owner.destroyed) return
      if (result.success) {
        this.context.onSaved(result.data)
        this.dialog.close()
      } else
        this.error.set(
          result.error.code === "ROLE_NOT_FOUND"
            ? "El rol ya no existe. Cierra y vuelve al catálogo."
            : "No pudimos guardar los permisos. Inténtalo de nuevo."
        )
    } catch {
      if (!this.destroyRef.destroyed)
        this.error.set("No pudimos guardar los permisos. Inténtalo de nuevo.")
    } finally {
      this.submitting.set(false)
    }
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.submitting() && this.dialog.open) this.dialog.close()
  }
}
