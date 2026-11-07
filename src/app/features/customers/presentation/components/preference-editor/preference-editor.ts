import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal
} from "@angular/core"
import { NgTemplateOutlet } from "@angular/common"
import { disabled, form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmCheckboxImports } from "@spartan-ng/helm/checkbox"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CustomerPreference } from "../../../domain/entities/customer-preference.entity"
import { CreateCustomerPreferenceParams } from "../../../domain/params/customer-relations.params"
import { CustomerRelationsStore } from "../../state/customer-relations.store"
import {
  customerDialogLifecycle,
  customerWriteError
} from "../customer-editor/customer-dialog-lifecycle"
import { PreferencePropertyChoices } from "../customer-preferences/preference-property-choices"

export interface PreferenceEditorContext {
  customerId: number
  customerName: string
  preference: CustomerPreference | null
  choices: () => PreferencePropertyChoices
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  onSaved: () => void
}
@Component({
  selector: "app-preference-editor",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgTemplateOutlet,
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmTextareaImports,
    HlmNativeSelectImports,
    HlmCheckboxImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./preference-editor.html"
})
export class PreferenceEditor {
  readonly context = injectBrnDialogContext<PreferenceEditorContext>()
  readonly preferenceTypes = ["Limpieza", "Productos", "Horarios", "Mascotas", "Otro"] as const
  isPreferenceType(value: string): boolean {
    return this.preferenceTypes.some(type => type === value)
  }
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly relations = inject(CustomerRelationsStore)
  readonly error = signal("")
  readonly model = signal({
    propertyId:
      this.context.preference?.propertyId == null
        ? "general"
        : String(this.context.preference.propertyId),
    type: this.context.preference?.type ?? "",
    detail: this.context.preference?.detail ?? "",
    isActive: this.context.preference?.isActive ?? true
  })
  readonly unknownScope = computed(() => !this.validScope(this.model().propertyId))
  private validScope(value: string): boolean {
    return value === "general" || this.context.choices().items.some(p => String(p.id) === value)
  }
  readonly profile = form(this.model, path => {
    disabled(path.isActive, () => this.relations.pendingPreferenceWrites() > 0)
    for (const key of ["type", "detail"] as const)
      validate(path[key], ({ value }) =>
        !value().trim() ? { kind: "required", message: "Completa este campo." } : undefined
      )
    validate(path.type, ({ value }) =>
      value().trim().length > 50
        ? { kind: "maxLength", message: "Usa como máximo 50 caracteres." }
        : undefined
    )
    validate(path.propertyId, ({ value }) =>
      !this.validScope(value())
        ? {
            kind: "scope",
            message:
              "Elige una propiedad verificada del cliente o cambia explícitamente a Todo el cliente."
          }
        : undefined
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
  save(): Promise<boolean> {
    if (
      !this.current() ||
      this.profile().submitting() ||
      this.relations.pendingPreferenceWrites() > 0
    )
      return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const v = this.model()
      // Recheck the live owner projection at dispatch; never coerce an unknown association to null.
      if (!this.validScope(v.propertyId)) return
      const params: CreateCustomerPreferenceParams = {
        propertyId: v.propertyId === "general" ? null : Number(v.propertyId),
        type: v.type.trim(),
        detail: v.detail.trim(),
        isActive: v.isActive
      }
      try {
        const request = this.context.preference
          ? this.relations.updatePreference(this.context.customerId, {
              id: this.context.preference.id,
              ...params
            })
          : this.relations.createPreference(this.context.customerId, params)
        const result = await firstValueFrom(
          request.pipe(
            takeUntil(this.context.ownerChanged$),
            takeUntil(this.lifecycle.cancelled$),
            takeUntilDestroyed(this.destroyRef),
            takeUntilDestroyed(this.context.owner)
          ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success)
          this.error.set(
            result.error.code === "NOT_FOUND"
              ? "La preferencia ya no está disponible. Cierra y vuelve a consultar."
              : result.error.code === "INVALID_INPUT"
                ? "Revisa los datos y el alcance de la preferencia."
                : result.error.code === "CONFLICT"
                  ? "Los datos entran en conflicto. Revisa la preferencia antes de reintentar."
                  : customerWriteError(result.error.code)
          )
        else {
          this.context.onSaved()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current())
          this.error.set(
            "No se pudo confirmar el guardado. Consulta las preferencias antes de reintentar."
          )
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
