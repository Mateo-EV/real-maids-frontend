import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { disabled, form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { CustomerSupportErrorCode } from "../../../domain/errors/customer-support.error"
import { SupportRequestView } from "../../../domain/models/support-views"
import { SupportRequestsStore } from "../../state/support-requests.store"

export interface SupportStateContext {
  request: SupportRequestView
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  onSaved: () => void
}

/**
 * Documented target codes of the change-state operation (S5 light/README). The transition
 * table is the backend's authority: this list is deliberately not filtered by "allowed"
 * moves, only the state the record already has is left out.
 */
const STATE_TARGETS = ["EN_REVISION", "RESUELTA", "CERRADA"] as const
const messageLimit = 4000

/**
 * T8 state consumer (S5, S6, S8): send the chosen code and surface the server's answer.
 * A 400 for a refused transition becomes a safe inline error with the draft preserved; the
 * client never pre-validates the backend's type-conditional rules.
 */
@Component({
  selector: "app-support-state-dialog",
  imports: [
    FormField,
    FormRoot,
    HlmAlertImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmFieldImports,
    HlmNativeSelectImports,
    HlmSpinnerImports,
    HlmTextareaImports
  ],
  templateUrl: "./support-state-dialog.html"
})
export class SupportStateDialog {
  readonly context = injectBrnDialogContext<SupportStateContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(SupportRequestsStore)
  readonly error = signal("")
  readonly model = signal({ state: "", message: "" })
  /** The current state is not a target; no other move is predicted or hidden. */
  readonly targets = computed(() =>
    STATE_TARGETS.filter(code => code !== this.context.request.state).map(code => ({
      value: code,
      label: code
    }))
  )

  readonly profile = form(this.model, path => {
    disabled(path, () => this.store.writing())
    validate(path.state, ({ value }) =>
      this.targets().some(target => target.value === value())
        ? undefined
        : { kind: "choice", message: "Selecciona un estado destino." }
    )
    // The note is optional; the backend decides when a transition needs one.
    validate(path.message, ({ value }) =>
      value().trim().length <= messageLimit
        ? undefined
        : { kind: "maxLength", message: `Usa como máximo ${messageLimit} caracteres.` }
    )
  })
  readonly pending = computed(() => this.profile().submitting() || this.store.writing())
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set("La sesión no está disponible. Vuelve a iniciar sesión.")
  )

  private current(): boolean {
    return (
      !this.destroyRef.destroyed &&
      !this.context.owner.destroyed &&
      this.context.current() &&
      this.lifecycle.current() &&
      this.dialog.open
    )
  }

  save(): Promise<boolean> {
    if (!this.current() || this.pending()) return Promise.resolve(false)
    this.error.set("")
    this.profile.state().markAsTouched()
    return submit(this.profile, async () => {
      const value = this.model()
      if (!this.current() || this.store.writing()) return
      const target = this.targets().find(candidate => candidate.value === value.state)
      if (!target) return
      const message = value.message.trim()
      if (message.length > messageLimit) return
      try {
        const result = await firstValueFrom(
          this.store
            .changeState(this.context.request.id, { state: target.value, message: message || null })
            .pipe(
              takeUntil(this.context.ownerChanged$),
              takeUntil(this.lifecycle.cancelled$),
              takeUntilDestroyed(this.destroyRef),
              takeUntilDestroyed(this.context.owner)
            ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success) this.error.set(this.writeError(result.error.code))
        else {
          this.context.onSaved()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current())
          this.error.set(
            "No se pudo confirmar el cambio de estado. Consulta la atención antes de reintentar."
          )
      }
    })
  }

  private writeError(code: CustomerSupportErrorCode): string {
    switch (code) {
      case "FORBIDDEN":
        return "No tienes permiso para cambiar el estado de esta atención."
      case "VALIDATION":
        return "El servidor rechazó el cambio de estado. Revisa el estado destino y el mensaje; puede requerir una respuesta o no estar permitido desde el estado actual."
      case "NOT_FOUND":
        return "La atención ya no está disponible. Cierra y vuelve a consultarla."
      case "CONFLICT":
        return "Hay otra operación en curso. Espera un momento y reintenta."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNAVAILABLE":
        return "El servicio de soporte no está disponible en este momento."
      default:
        return "No se pudo confirmar el cambio de estado. Consulta la atención antes de reintentar."
    }
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.pending() && this.dialog.open) this.dialog.close()
  }
}
