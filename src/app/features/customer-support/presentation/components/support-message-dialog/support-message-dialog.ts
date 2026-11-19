import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { disabled, form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { CustomerSupportErrorCode } from "../../../domain/errors/customer-support.error"
import { SupportRequestView } from "../../../domain/models/support-views"
import { SupportRequestsStore } from "../../state/support-requests.store"

export interface SupportMessageContext {
  request: SupportRequestView
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  onSaved: () => void
}

/** Documented wire limit for one follow-up message (S8). */
const messageLimit = 4000

/**
 * T8 reply consumer (S5, S6, S8): one trimmed message for the captured request. Author,
 * timestamp and any state movement stay server-owned; a refused answer is surfaced inline
 * with the draft intact and never replayed.
 */
@Component({
  selector: "app-support-message-dialog",
  imports: [
    FormField,
    FormRoot,
    HlmAlertImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmFieldImports,
    HlmSpinnerImports,
    HlmTextareaImports
  ],
  templateUrl: "./support-message-dialog.html"
})
export class SupportMessageDialog {
  readonly context = injectBrnDialogContext<SupportMessageContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(SupportRequestsStore)
  readonly error = signal("")
  readonly model = signal({ message: "" })

  readonly profile = form(this.model, path => {
    disabled(path, () => this.store.writing())
    validate(path.message, ({ value }) => {
      const message = value().trim()
      if (!message) return { kind: "required", message: "El mensaje es obligatorio." }
      return message.length > messageLimit
        ? { kind: "maxLength", message: `Usa como máximo ${messageLimit} caracteres.` }
        : undefined
    })
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
    return submit(this.profile, async () => {
      const message = this.model().message.trim()
      if (!this.current() || this.store.writing()) return
      if (!message || message.length > messageLimit) return
      try {
        const result = await firstValueFrom(
          this.store
            .addMessage(this.context.request.id, { message })
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
            "No se pudo confirmar el mensaje. Consulta el seguimiento antes de reintentar."
          )
      }
    })
  }

  private writeError(code: CustomerSupportErrorCode): string {
    switch (code) {
      case "FORBIDDEN":
        return "No tienes permiso para responder esta atención."
      case "NOT_FOUND":
        return "La atención ya no está disponible. Cierra y vuelve a consultarla."
      case "VALIDATION":
        return "Revisa el mensaje: el servidor no lo aceptó."
      case "CONFLICT":
        return "Hay otra operación en curso. Espera un momento y reintenta."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "UNAVAILABLE":
        return "El servicio de soporte no está disponible en este momento."
      default:
        return "No se pudo confirmar el mensaje. Consulta el seguimiento antes de reintentar."
    }
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.pending() && this.dialog.open) this.dialog.close()
  }
}
