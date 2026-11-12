import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { firstValueFrom, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { Lead } from "../../../domain/entities/lead.entity"
import { CustomerErrorCode } from "../../../domain/errors/customer.error"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"
import {
  customerDialogLifecycle,
  customerWriteError
} from "../customer-editor/customer-dialog-lifecycle"

export interface LeadDeleteContext {
  lead: Lead
  owner: DestroyRef
  current: () => boolean
  onDeleted: () => void
}

/**
 * Refusals stay presentation-safe: the backend message names the conversion, but raw
 * text is never surfaced. A conflict can also mean another aggregate still references it.
 */
function deleteError(code: CustomerErrorCode): string {
  switch (code) {
    case "LEAD_NOT_FOUND":
      return "El prospecto ya no está disponible. Cierra y vuelve a la bandeja."
    case "CONFLICT":
      return "El servidor rechazó la eliminación: el prospecto está convertido o tiene registros asociados. Se conserva sin cambios."
    case "NETWORK":
      return "No se pudo confirmar la eliminación. Consulta el prospecto antes de reintentar; la solicitud pudo haberse procesado."
    default:
      return customerWriteError(code)
  }
}

@Component({
  selector: "app-lead-delete-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HlmDialogImports, HlmButtonImports, HlmAlertImports, HlmSpinnerImports],
  templateUrl: "./lead-delete-dialog.html"
})
export class LeadDeleteDialog {
  readonly context = injectBrnDialogContext<LeadDeleteContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(CustomerAcquisitionStore)
  readonly submitting = signal(false)
  readonly error = signal("")
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set(customerWriteError("UNAUTHENTICATED"))
  )

  private current(): boolean {
    return (
      !this.context.owner.destroyed &&
      this.context.current() &&
      this.lifecycle.current() &&
      this.dialog.open
    )
  }

  async confirm(): Promise<void> {
    const id = this.context.lead.id
    if (!this.current() || this.submitting() || this.store.writing()) return
    // The captured id is the only wire input; the server remains the deletion authority.
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) {
      this.error.set("El prospecto seleccionado ya no es válido.")
      return
    }
    this.submitting.set(true)
    this.error.set("")
    try {
      const result = await firstValueFrom(
        this.store
          .deleteLead(id)
          .pipe(
            takeUntil(this.lifecycle.cancelled$),
            takeUntilDestroyed(this.destroyRef),
            takeUntilDestroyed(this.context.owner)
          ),
        { defaultValue: undefined }
      )
      if (!this.current() || !result) return
      if (!result.success) this.error.set(deleteError(result.error.code))
      else {
        this.context.onDeleted()
        if (this.current()) this.dialog.close()
      }
    } catch {
      if (this.current()) this.error.set(deleteError("UNEXPECTED"))
    } finally {
      if (!this.destroyRef.destroyed) this.submitting.set(false)
    }
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.submitting() && this.dialog.open) this.dialog.close()
  }
}
