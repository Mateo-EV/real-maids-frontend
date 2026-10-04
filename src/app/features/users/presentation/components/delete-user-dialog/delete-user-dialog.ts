import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from "@angular/core"
import { firstValueFrom } from "rxjs"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { connectUserDialogDismissal } from "../user-dialog-dismissal"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { User } from "../../../domain/entities/user.entity"
import { UserStore } from "../../state/user.store"

export interface DeleteUserContext {
  user: User
  onDeleted: () => void
}

@Component({
  selector: "app-delete-user-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmDialogImports, HlmButtonImports, HlmAlertImports, HlmSpinnerImports],
  template: `
    <hlm-dialog-header>
      <h2 hlmDialogTitle>Eliminar usuario</h2>
      <p hlmDialogDescription>Esta acción elimina el perfil del usuario.</p>
    </hlm-dialog-header>
    <div class="my-4 rounded-lg bg-muted p-4">
      <p class="font-semibold">{{ context.user.name }} · #USR-{{ context.user.id }}</p>
      <p class="text-sm break-all">{{ context.user.email }}</p>
    </div>
    <p class="text-sm">¿Confirmas la eliminación de este usuario?</p>
    @if (error()) {
      <div hlmAlert variant="destructive" role="alert" class="my-4">
        <p hlmAlertTitle>No se eliminó el usuario</p>
        <p hlmAlertDescription>{{ error() }}</p>
      </div>
    }
    <hlm-dialog-footer class="mt-4">
      <button
        id="cancel-delete-user"
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
        variant="destructive"
        type="button"
        [disabled]="submitting()"
        [attr.aria-busy]="submitting()"
        (click)="confirm()"
      >
        @if (submitting()) {
          <hlm-spinner aria-label="Eliminando" />
        }
        {{ submitting() ? "Eliminando…" : "Confirmar eliminación" }}
      </button>
    </hlm-dialog-footer>
  `
})
export class DeleteUserDialog {
  readonly context = injectBrnDialogContext<DeleteUserContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly users = inject(UserStore)
  readonly submitting = signal(false)
  readonly error = signal("")

  constructor() {
    connectUserDialogDismissal(this.destroyRef, () => this.cancel())
  }

  async confirm(): Promise<void> {
    if (this.destroyRef.destroyed || this.submitting()) return
    this.submitting.set(true)
    this.error.set("")
    try {
      const result = await firstValueFrom(
        this.users.deleteUserById(this.context.user.id).pipe(takeUntilDestroyed(this.destroyRef)),
        { defaultValue: undefined }
      )
      if (this.destroyRef.destroyed || !result) return
      if (result.success) {
        this.context.onDeleted()
        this.dialog.close()
      } else
        this.error.set(
          result.error.code === "USER_NOT_FOUND"
            ? "El usuario ya no existe. Cierra y vuelve al catálogo."
            : "No pudimos eliminar el usuario. Inténtalo de nuevo."
        )
    } catch {
      if (!this.destroyRef.destroyed)
        this.error.set("No pudimos eliminar el usuario. Inténtalo de nuevo.")
    } finally {
      this.submitting.set(false)
    }
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.submitting() && this.dialog.open) this.dialog.close()
  }
}
