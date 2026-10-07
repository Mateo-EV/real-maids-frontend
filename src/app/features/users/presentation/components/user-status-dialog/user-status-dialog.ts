import { Component, DestroyRef, inject, signal } from "@angular/core"
import { firstValueFrom } from "rxjs"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { User } from "../../../domain/entities/user.entity"
import { UserStore } from "../../state/user.store"
import { connectUserDialogDismissal } from "../user-dialog-dismissal"

export interface UserStatusContext {
  user: User
  onChanged: () => void
}

@Component({
  selector: "app-user-status-dialog",
  imports: [HlmDialogImports, HlmButtonImports, HlmAlertImports, HlmSpinnerImports],
  template: `
    <hlm-dialog-header>
      <h2 hlmDialogTitle>{{ action }} usuario</h2>
      <p hlmDialogDescription>Confirma el cambio de estado de este perfil.</p>
    </hlm-dialog-header>
    <div class="my-4 rounded-lg bg-muted p-4">
      <p class="font-semibold">{{ context.user.name }} · #USR-{{ context.user.id }}</p>
      <p class="text-sm break-all">{{ context.user.email }}</p>
      <p class="mt-2 text-sm">{{ nextActive ? "Inactivo → Activo" : "Activo → Inactivo" }}</p>
    </div>
    <p class="text-sm">¿Confirmas {{ nextActive ? "activar" : "desactivar" }} este usuario?</p>
    @if (error()) {
      <div hlmAlert variant="destructive" role="alert" class="my-4">
        <p hlmAlertTitle>No se cambió el estado</p>
        <p hlmAlertDescription>{{ error() }}</p>
      </div>
    }
    <hlm-dialog-footer class="mt-4">
      <button id="cancel-status-user" hlmBtn variant="outline" type="button"
        [disabled]="submitting()" (click)="cancel()">Cancelar</button>
      <button hlmBtn type="button" [disabled]="submitting()"
        [attr.aria-busy]="submitting()" (click)="confirm()">
        @if (submitting()) {
          <hlm-spinner aria-label="Cambiando estado" />
        }
        {{ submitting() ? "Cambiando estado…" : error() ? "Reintentar " + action.toLowerCase() : "Confirmar " + action.toLowerCase() }}
      </button>
    </hlm-dialog-footer>
  `
})
export class UserStatusDialog {
  readonly context = injectBrnDialogContext<UserStatusContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly users = inject(UserStore)
  // Capture the intended direction once; retries confirm the same change, never toggle again.
  readonly nextActive = !this.context.user.isActive
  readonly action = this.nextActive ? "Activar" : "Desactivar"
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
        this.users.updateUserStatusById(this.context.user.id, this.nextActive)
          .pipe(takeUntilDestroyed(this.destroyRef)),
        { defaultValue: undefined }
      )
      if (this.destroyRef.destroyed || !result) return
      if (result.success) {
        this.context.onChanged()
        this.dialog.close()
      } else {
        this.error.set(
          result.error.code === "USER_NOT_FOUND"
            ? "El usuario ya no existe. Cierra y vuelve al catálogo."
            : "No pudimos cambiar el estado. Inténtalo de nuevo."
        )
      }
    } catch {
      if (!this.destroyRef.destroyed)
        this.error.set("No pudimos cambiar el estado. Inténtalo de nuevo.")
    } finally {
      this.submitting.set(false)
    }
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.submitting() && this.dialog.open) this.dialog.close()
  }
}
