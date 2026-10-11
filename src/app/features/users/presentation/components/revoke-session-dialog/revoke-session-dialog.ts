import { Component, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { firstValueFrom } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { User } from "../../../domain/entities/user.entity"
import { UserSession } from "../../../domain/entities/user-session.entity"
import { UserSessionsStore } from "../../state/user-sessions.store"
import { connectUserDialogDismissal } from "../user-dialog-dismissal"

export interface RevokeSessionContext {
  user: Pick<User, "id" | "name">
  session: UserSession
  onRevoked: () => void
}

@Component({
  selector: "app-revoke-session-dialog",
  imports: [HlmDialogImports, HlmButtonImports, HlmAlertImports, HlmSpinnerImports],
  template: `
    <hlm-dialog-header>
      <h2 hlmDialogTitle>Cerrar sesión</h2>
      <p hlmDialogDescription>Confirma la conexión que deseas cerrar.</p>
    </hlm-dialog-header>
    <div class="my-4 rounded-lg border bg-muted p-3">
      <p class="font-semibold break-words">{{ context.user.name }} · #USR-{{ context.user.id }}</p>
      <p class="mt-1 text-sm break-words">{{ context.session.device }}</p>
      <p class="mt-1 text-xs">IP: {{ context.session.ip }}</p>
    </div>
    <p class="text-sm">¿Quieres cerrar esta sesión?</p>
    @if (error()) {
      <div hlmAlert variant="destructive" class="my-3" role="alert">
        <h3 hlmAlertTitle>No se cerró la sesión</h3>
        <p hlmAlertDescription>{{ error() }}</p>
      </div>
    }
    <hlm-dialog-footer class="mt-4 border-t pt-3">
      <button hlmBtn variant="outline" type="button" [disabled]="submitting()" (click)="cancel()">
        Cancelar
      </button>
      <button
        hlmBtn
        type="button"
        [disabled]="submitting() || context.session.isCurrent"
        [attr.aria-busy]="submitting()"
        (click)="confirm()"
      >
        @if (submitting()) {
          <hlm-spinner aria-label="Cerrando sesión" />
        }
        {{ submitting() ? "Cerrando sesión…" : "Confirmar cierre" }}
      </button>
    </hlm-dialog-footer>
  `
})
export class RevokeSessionDialog {
  readonly context = injectBrnDialogContext<RevokeSessionContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly sessions = inject(UserSessionsStore)
  readonly submitting = signal(false)
  readonly error = signal("")

  constructor() {
    connectUserDialogDismissal(this.destroyRef, () => this.cancel())
  }

  async confirm(): Promise<void> {
    if (this.destroyRef.destroyed || this.submitting() || this.context.session.isCurrent) return
    this.submitting.set(true)
    this.error.set("")
    try {
      const result = await firstValueFrom(
        this.sessions
          .revokeSession(this.context.user.id, this.context.session.id)
          .pipe(takeUntilDestroyed(this.destroyRef)),
        { defaultValue: undefined }
      )
      if (this.destroyRef.destroyed || !result) return
      if (result.success) {
        this.context.onRevoked()
        this.dialog.close()
      } else
        this.error.set(
          result.error.code === "CURRENT_SESSION"
            ? "Para cerrar tu sesión actual usa Salir en el menú de la cuenta."
            : result.error.code === "SESSION_NOT_FOUND"
              ? "La sesión ya no está activa. Cierra y vuelve al listado."
              : result.error.code === "VALIDATION"
                ? "El servidor rechazó el cierre. La sesión actual solo se cierra desde Salir."
                : result.error.code === "FORBIDDEN"
                  ? "No tienes autorización para cerrar esta sesión."
                  : result.error.code === "UNAUTHENTICATED"
                    ? "Inicia sesión nuevamente para continuar."
                    : "No pudimos cerrar la sesión. Inténtalo de nuevo."
        )
    } catch {
      if (!this.destroyRef.destroyed)
        this.error.set("No pudimos cerrar la sesión. Inténtalo de nuevo.")
    } finally {
      this.submitting.set(false)
    }
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.submitting() && this.dialog.open) this.dialog.close()
  }
}
