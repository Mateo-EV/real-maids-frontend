import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { OperationsErrorCode } from "../../../domain/errors/operations.error"
import { ServiceRequestSummary } from "../../../domain/models/operations-read.models"
import { ServiceRequestsStore } from "../../state/service-requests.store"

export interface ServiceRequestCancelContext {
  request: ServiceRequestSummary
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  onCancelled: () => void
}

@Component({
  selector: "app-service-request-cancel-dialog",
  imports: [
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmTextareaImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./service-request-cancel-dialog.html"
})
export class ServiceRequestCancelDialog {
  readonly context = injectBrnDialogContext<ServiceRequestCancelContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(ServiceRequestsStore)
  readonly error = signal("")
  readonly model = signal({ reason: "" })
  readonly profile = form(this.model, path => {
    validate(path.reason, ({ value }) => {
      const text = value().trim()
      return text.length > 0 && text.length <= 250
        ? undefined
        : {
            kind: "reason",
            message: "Escribe un motivo de entre 1 y 250 caracteres."
          }
    })
  })
  readonly pending = computed(() => this.profile().submitting() || this.store.writing())
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set("La sesión no está disponible. Vuelve a iniciar sesión.")
  )
  private current(): boolean {
    return (
      !this.context.owner.destroyed &&
      this.context.current() &&
      this.lifecycle.current() &&
      this.dialog.open
    )
  }
  private writeError(code: OperationsErrorCode): string {
    switch (code) {
      case "FORBIDDEN":
        return "No tienes permiso para cancelar esta solicitud."
      case "NOT_FOUND":
        return "La solicitud ya no está disponible. Cierra y vuelve a consultarla."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "INVALID_DATA":
        return "Revisa el motivo y el estado actual de la solicitud antes de reintentar."
      case "CONFLICT":
        return "La solicitud cambió o está en conflicto. Consulta su estado antes de reintentar."
      default:
        return "No se pudo confirmar la cancelación. Consulta el estado antes de reintentar; la solicitud pudo haberse procesado."
    }
  }
  save(): Promise<boolean> {
    if (!this.current() || this.pending()) return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const reason = this.model().reason.trim()
      if (!this.current() || this.store.writing() || !reason || reason.length > 250) return
      const request = this.context.request
      try {
        const result = await firstValueFrom(
          this.store
            .cancelRequest(request.id, { reason }, request.customerId)
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
          this.context.onCancelled()
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current()) this.error.set(this.writeError("UNKNOWN"))
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.pending() && this.dialog.open) this.dialog.close()
  }
}
