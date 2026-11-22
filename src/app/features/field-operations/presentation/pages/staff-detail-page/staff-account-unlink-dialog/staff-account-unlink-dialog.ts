import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmDialogDescription, HlmDialogHeader, HlmDialogTitle } from "@spartan-ng/helm/dialog"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { LinkStaffAccountUseCase } from "../../../../application/use-cases/field-staff.use-cases"
import { FieldOperationsErrorCode } from "../../../../domain/errors/field-operations.error"
import { staffAccountLinkError } from "../staff-account-link-dialog/staff-account-link-dialog"

export interface StaffAccountUnlinkContext {
  readonly staff: { readonly id: number; readonly name: string; readonly userId: number }
  readonly owner: DestroyRef
  readonly ownerChanged$: Observable<void>
  readonly current: () => boolean
  /** Confirmed success: the owner emits one message and forces exactly one fresh read. */
  readonly onUnlinked: () => void
}

function unlinkError(code: FieldOperationsErrorCode): string {
  if (code === "CONFLICT" || code === "INVALID_DATA") return staffAccountLinkError("NOT_FOUND")
  return staffAccountLinkError(code)
}

/**
 * WP11 S4–S5 — explicit confirmation before unlinking the account.
 *
 * It names the collaborator and the account by its supplied identifier (the contract never exposes
 * the account's email) and states the real consequence: the account stops seeing this collaborator's
 * services while the assignments stay on the record. It promises neither session termination nor
 * account deactivation, because the backend does neither. Pending blocks a duplicate confirmation
 * and every dismissal; a refusal keeps the same confirmation open for an explicit retry.
 */
@Component({
  selector: "app-staff-account-unlink-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HlmAlertImports,
    HlmButtonImports,
    HlmDialogDescription,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmSpinnerImports
  ],
  templateUrl: "./staff-account-unlink-dialog.html"
})
export class StaffAccountUnlinkDialog {
  readonly context = injectBrnDialogContext<StaffAccountUnlinkContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly link = inject(LinkStaffAccountUseCase)
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set("La sesión no está disponible. Vuelve a iniciar sesión.")
  )
  readonly error = signal("")
  readonly pending = signal(false)

  private current(): boolean {
    return (
      !this.destroyRef.destroyed &&
      this.context.current() &&
      this.lifecycle.current() &&
      this.dialog.open
    )
  }

  async save(): Promise<boolean> {
    if (!this.current() || this.pending()) return false
    this.error.set("")
    this.pending.set(true)
    try {
      const result = await firstValueFrom(
        this.link
          .execute(this.context.staff.id, { userId: null })
          .pipe(
            takeUntil(this.context.ownerChanged$),
            takeUntil(this.lifecycle.cancelled$),
            takeUntilDestroyed(this.destroyRef)
          ),
        { defaultValue: undefined }
      )
      if (!this.current() || !result) return false
      if (!result.success) {
        this.error.set(unlinkError(result.error.code))
        return false
      }
      this.context.onUnlinked()
      if (this.current()) this.dialog.close()
      return true
    } catch {
      if (this.current()) this.error.set(unlinkError("UNKNOWN"))
      return false
    } finally {
      if (!this.destroyRef.destroyed) this.pending.set(false)
    }
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.pending() && this.dialog.open) this.dialog.close()
  }
}
