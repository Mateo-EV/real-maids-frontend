import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  OnInit,
  signal
} from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { Lead } from "../../../domain/entities/lead.entity"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"
import {
  customerDialogLifecycle,
  customerWriteError
} from "../customer-editor/customer-dialog-lifecycle"

interface FollowUpContext {
  lead: Lead
  owner: DestroyRef
  stopped$: Observable<void>
  current: () => boolean
  onSaved: () => void
}
@Component({
  selector: "app-lead-follow-up-editor",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmTextareaImports,
    HlmNativeSelectImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./lead-follow-up-editor.html"
})
export class LeadFollowUpEditor implements OnInit {
  readonly context = injectBrnDialogContext<FollowUpContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(CustomerAcquisitionStore)
  readonly stages = this.store.stages
  readonly error = signal("")
  readonly model = signal({ stageId: "", comment: "" })
  hasChoice(value: string): boolean {
    return !!this.stages().data?.some(stage => String(stage.id) === value)
  }
  private verifiedChoice(value: string): boolean {
    const entry = this.stages()
    return (
      entry.loaded &&
      !entry.error &&
      !entry.pendingReads &&
      /^[1-9]\d*$/.test(value) &&
      this.hasChoice(value)
    )
  }
  readonly profile = form(this.model, path => {
    validate(path.stageId, ({ value }) =>
      this.verifiedChoice(value())
        ? undefined
        : { kind: "choice", message: "Selecciona una etapa verificada del catálogo disponible." }
    )
  })
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
  ngOnInit(): void {
    this.loadStages()
  }
  loadStages(force = false): void {
    if (!this.current() || this.profile().submitting()) return
    this.store
      .loadStages(force)
      .pipe(
        takeUntil(this.context.stopped$),
        takeUntil(this.lifecycle.cancelled$),
        takeUntilDestroyed(this.destroyRef),
        takeUntilDestroyed(this.context.owner)
      )
      .subscribe()
  }
  save(): Promise<boolean> {
    if (!this.current() || this.profile().submitting() || this.store.writing())
      return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const value = this.model()
      if (!this.current() || !this.verifiedChoice(value.stageId)) return
      try {
        const result = await firstValueFrom(
          this.store
            .addFollowUp({
              leadId: this.context.lead.id,
              stageId: Number(value.stageId),
              comment: value.comment.trim() || null
            })
            .pipe(
              takeUntil(this.context.stopped$),
              takeUntil(this.lifecycle.cancelled$),
              takeUntilDestroyed(this.destroyRef),
              takeUntilDestroyed(this.context.owner)
            ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success)
          this.error.set(
            result.error.code === "INVALID_INPUT"
              ? "Revisa la etapa y el comentario."
              : result.error.code === "LEAD_NOT_FOUND"
                ? "El prospecto ya no está disponible. Cierra y vuelve a consultarlo."
                : result.error.code === "CONFLICT"
                  ? "No se pudo registrar por un conflicto. Revisa el prospecto antes de reintentar."
                  : customerWriteError(result.error.code)
          )
        else {
          this.context.onSaved()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current())
          this.error.set(
            "No se pudo confirmar el registro. Consulta los seguimientos antes de reintentar."
          )
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
