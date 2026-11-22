import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmAlert, HlmAlertDescription, HlmAlertTitle } from "@spartan-ng/helm/alert"
import { HlmButton } from "@spartan-ng/helm/button"
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle
} from "@spartan-ng/helm/dialog"
import {
  HlmField,
  HlmFieldDescription,
  HlmFieldError,
  HlmFieldLabel,
  HlmFieldLegend,
  HlmFieldSet
} from "@spartan-ng/helm/field"
import { HlmInput } from "@spartan-ng/helm/input"
import { HlmSpinner } from "@spartan-ng/helm/spinner"
import { HlmTextarea } from "@spartan-ng/helm/textarea"
import { staffAbsenceMaxReason } from "../../../domain/models/staff-absence"
import { StaffAbsencesStore } from "../../state/staff-absences.store"
import { staffDialogLifecycle } from "../staff-editor/staff-dialog-lifecycle"
import { staffAbsenceWriteError } from "../staff-absence-errors"

export interface StaffAbsenceEditorContext {
  owner: DestroyRef
  ownerChanged$?: Observable<unknown>
  /** Confirmed success: the owner emits one generic message and re-reads the visible page once. */
  onSaved: () => void
}

/**
 * Own absence request (M06/RF07/HU07/P07; S2, S4, S7, S11) — create only.
 *
 * The dialog sends exactly the documented `fechaInicio`/`fechaFin`/`motivo`: no staff id (the backend
 * resolves the caller's staff record), no actor, no status, no browser-derived "today" and no client
 * day arithmetic. Both dates are inclusive calendar days, and the reason is mandatory, trimmed and
 * printed as plain text — it never travels in a URL, a log or a toast.
 *
 * Pending state blocks a duplicate submit and every dismissal. A server refusal keeps the dialog and
 * its draft open with project-owned copy, because an overlap, a duplicate range or a
 * conflict-with-services rule is the server's decision (S11), not a local guess.
 */
@Component({
  selector: "app-staff-absence-editor",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    FormRoot,
    HlmAlert,
    HlmAlertDescription,
    HlmAlertTitle,
    HlmButton,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmField,
    HlmFieldDescription,
    HlmFieldError,
    HlmFieldLabel,
    HlmFieldLegend,
    HlmFieldSet,
    HlmInput,
    HlmSpinner,
    HlmTextarea
  ],
  templateUrl: "./staff-absence-editor.html"
})
export class StaffAbsenceEditor {
  readonly context = injectBrnDialogContext<StaffAbsenceEditorContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly absences = inject(StaffAbsencesStore)
  readonly error = signal("")
  readonly model = signal({ startDate: "", endDate: "", reason: "" })
  readonly profile = form(this.model, path => {
    validate(path.startDate, ({ value }) =>
      value() ? undefined : { kind: "required", message: "Indica el primer día de la ausencia." }
    )
    validate(path.endDate, ({ value, valueOf }) => {
      // Inclusive range (S4): the last day may equal the first, never precede it.
      if (!value()) return { kind: "required", message: "Indica el último día de la ausencia." }
      const start = valueOf(path.startDate)
      return start && value() < start
        ? { kind: "range", message: "El último día no puede ser anterior al primero." }
        : undefined
    })
    validate(path.reason, ({ value }) => {
      const reason = value().trim()
      if (!reason)
        return {
          kind: "required",
          message: "El motivo es obligatorio: es el texto que verán RRHH y tú."
        }
      // Documented `@Size(max = 500)` on the trimmed text that actually travels.
      return reason.length > staffAbsenceMaxReason
        ? {
            kind: "maxLength",
            message: `El motivo admite como máximo ${staffAbsenceMaxReason} caracteres.`
          }
        : undefined
    })
  })
  private readonly lifecycle = staffDialogLifecycle(
    () => this.cancel(),
    () => this.error.set(staffAbsenceWriteError("UNAUTHENTICATED"))
  )

  /**
   * The owner closes this overlay itself (route, session replacement or destruction), so the dialog
   * never re-closes an overlay whose view is already gone. The owner's `DestroyRef` fences the write.
   */
  constructor() {
    this.context.ownerChanged$?.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.context.owner.destroyed) this.dialog.forceClose()
    })
  }

  private current(): boolean {
    return !this.context.owner.destroyed && this.lifecycle.current() && this.dialog.open
  }

  save(): Promise<boolean> {
    if (!this.current() || this.profile().submitting()) return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const value = this.model()
      const reason = value.reason.trim()
      // Never dispatch an out-of-contract body; the form validation already blocks it.
      if (
        !value.startDate ||
        !value.endDate ||
        value.endDate < value.startDate ||
        !reason ||
        reason.length > staffAbsenceMaxReason
      )
        return
      if (!this.current()) return
      try {
        const result = await firstValueFrom(
          this.absences
            .createAbsence({ startDate: value.startDate, endDate: value.endDate, reason })
            .pipe(
              takeUntil(this.lifecycle.cancelled$),
              takeUntilDestroyed(this.destroyRef),
              takeUntilDestroyed(this.context.owner)
            ),
          { defaultValue: undefined }
        )
        if (!result || !this.current()) return
        if (!result.success) {
          this.error.set(staffAbsenceWriteError(result.error.code))
          return
        }
        this.context.onSaved()
        if (this.current()) this.dialog.close()
      } catch {
        if (this.current()) this.error.set(staffAbsenceWriteError("UNKNOWN"))
      }
    })
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
