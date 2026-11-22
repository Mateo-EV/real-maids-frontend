import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal
} from "@angular/core"
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
import { HlmSpinner } from "@spartan-ng/helm/spinner"
import { HlmTextarea } from "@spartan-ng/helm/textarea"
import {
  StaffAbsenceDecision,
  staffAbsenceMaxObservation,
  staffAbsenceStatusName,
  StaffAbsenceStatus
} from "../../../domain/models/staff-absence"
import { StaffAbsencesStore } from "../../state/staff-absences.store"
import { staffDialogLifecycle } from "../staff-editor/staff-dialog-lifecycle"
import { staffAbsenceWriteError } from "../staff-absence-errors"

/** Which side of the workflow is asking: the employee's own cancellation, or an HR decision. */
export type StaffAbsenceActor = "owner" | "hr"

/** Captured, non-sensitive context of the verified record; nothing is re-read from the store. */
export interface StaffAbsenceDecisionRecord {
  readonly id: number
  readonly staffName: string
  readonly startDate: string
  readonly endDate: string
  readonly days: number
  readonly status: StaffAbsenceStatus
}

export interface StaffAbsenceDecisionContext {
  absence: StaffAbsenceDecisionRecord
  target: StaffAbsenceDecision
  actor: StaffAbsenceActor
  owner: DestroyRef
  ownerChanged$: Observable<unknown>
  current: () => boolean
  /** Confirmed success: the owner emits one generic message and re-reads the affected entries once. */
  onChanged: () => void
}

const title: Record<StaffAbsenceDecision, string> = {
  APROBADA: "Aprobar ausencia",
  RECHAZADA: "Rechazar ausencia",
  CANCELADA: "Cancelar solicitud",
  RETIRADA: "Retirar ausencia"
}

const confirmLabel: Record<StaffAbsenceDecision, string> = {
  APROBADA: "Aprobar ausencia",
  RECHAZADA: "Rechazar ausencia",
  CANCELADA: "Cancelar solicitud",
  RETIRADA: "Retirar ausencia"
}

/**
 * The single confirmation dialog of the absence workflow (S2, S5, S6, S9).
 *
 * It names the affected employee, the inclusive day range and the supplied current → desired state,
 * and it sends only `estado` and an optional `observacion`. It never encodes a transition table, an
 * ACL or a business clock: the employee may only cancel a pending request, HR approves/rejects a
 * pending one and withdraws an approved one, and the backend remains the authority for every one of
 * those moves — including the conflict resolution an approval requires (S5).
 *
 * Pending blocks a duplicate submit and every dismissal. A refusal keeps the dialog open with
 * project-owned copy and no raw backend text; the reason text of the request is not part of this
 * confirmation at all, and no cancellation is presented as an undo.
 */
@Component({
  selector: "app-staff-absence-decision-dialog",
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
    HlmSpinner,
    HlmTextarea
  ],
  templateUrl: "./staff-absence-decision-dialog.html"
})
export class StaffAbsenceDecisionDialog {
  readonly context = injectBrnDialogContext<StaffAbsenceDecisionContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly absences = inject(StaffAbsencesStore)
  readonly error = signal("")
  readonly model = signal({ observation: "" })
  /**
   * Documented `@Size(max = 250)` on `observacion`, counted on the trimmed text. The draft is kept
   * and explained instead of being truncated while the user types.
   */
  readonly profile = form(this.model, path => {
    validate(path.observation, ({ value }) =>
      value().trim().length <= staffAbsenceMaxObservation
        ? undefined
        : {
            kind: "maxLength",
            message: `La observación admite como máximo ${staffAbsenceMaxObservation} caracteres.`
          }
    )
  })
  readonly title = computed(() => title[this.context.target])
  readonly confirmLabel = computed(() => confirmLabel[this.context.target])
  readonly targetName = computed(() => staffAbsenceStatusName(this.context.target))
  readonly currentName = computed(() => staffAbsenceStatusName(this.context.absence.status))
  /** The optional observation belongs to an HR resolution; an own cancellation sends `null`. */
  readonly asksObservation = computed(() => this.context.actor === "hr")
  readonly pending = computed(() => this.profile().submitting())
  private readonly lifecycle = staffDialogLifecycle(
    () => this.cancel(),
    () => this.error.set(staffAbsenceWriteError("UNAUTHENTICATED"))
  )

  /** The owner closes this overlay itself; a destroyed owner only forces the overlay away. */
  constructor() {
    this.context.ownerChanged$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      if (this.context.owner.destroyed) this.dialog.forceClose()
    })
  }

  private current(): boolean {
    return (
      !this.context.owner.destroyed &&
      this.context.current() &&
      this.lifecycle.current() &&
      this.dialog.open
    )
  }

  save(): Promise<boolean> {
    if (!this.current() || this.pending()) return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const observation = this.asksObservation() ? this.model().observation.trim() : ""
      if (observation.length > staffAbsenceMaxObservation || !this.current()) return
      try {
        const result = await firstValueFrom(
          this.absences
            .setAbsenceStatus(this.context.absence.id, {
              // The desired state travels untouched: the backend validates the move.
              status: this.context.target,
              observation: observation || null
            })
            .pipe(
              takeUntil(this.context.ownerChanged$),
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
        this.context.onChanged()
        if (this.current()) this.dialog.close()
      } catch {
        if (this.current()) this.error.set(staffAbsenceWriteError("UNKNOWN"))
      }
    })
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.pending() && this.dialog.open) this.dialog.close()
  }
}
