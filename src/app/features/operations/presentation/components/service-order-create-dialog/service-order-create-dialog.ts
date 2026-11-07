import { Component, computed, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmTextareaImports } from "@spartan-ng/helm/textarea"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { customerDialogLifecycle } from "@/app/features/customers/presentation/components/customer-editor/customer-dialog-lifecycle"
import { OperationsErrorCode } from "../../../domain/errors/operations.error"
import { ServiceOrdersStore } from "../../state/service-orders.store"

export interface ServiceOrderCreateContext {
  requestId: number
  customerId: number
  customerName: string
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  onCreated: (orderId: number) => void
}

const validAmount = (value: string) =>
  value === "" || /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(value)

@Component({
  selector: "app-service-order-create-dialog",
  imports: [
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmTextareaImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./service-order-create-dialog.html"
})
export class ServiceOrderCreateDialog {
  readonly context = injectBrnDialogContext<ServiceOrderCreateContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly orders = inject(ServiceOrdersStore)
  readonly error = signal("")
  readonly model = signal({ estimatedAmount: "", observation: "" })
  readonly profile = form(this.model, path => {
    validate(path.estimatedAmount, ({ value }) =>
      validAmount(value())
        ? undefined
        : {
            kind: "amount",
            message: "Usa un importe de 0 a 99999999.99, con punto y hasta dos decimales."
          }
    )
    validate(path.observation, ({ value }) =>
      value().length <= 2000
        ? undefined
        : {
            kind: "length",
            message: "La observación admite hasta 2000 caracteres."
          }
    )
  })
  readonly pending = computed(() => this.profile().submitting() || this.orders.writing())
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
        return "No tienes permiso para crear esta orden."
      case "NOT_FOUND":
        return "La solicitud ya no está disponible. Cierra y vuelve a consultarla."
      case "UNAUTHENTICATED":
        return "La sesión no está disponible. Vuelve a iniciar sesión."
      case "INVALID_DATA":
        return "Revisa el importe, la observación y el estado de la solicitud."
      case "CONFLICT":
        return "La solicitud cambió o ya fue atendida. Consulta su estado antes de reintentar."
      default:
        return "No se pudo confirmar la creación. Consulta el estado antes de reintentar; la solicitud pudo haberse procesado."
    }
  }
  save(): Promise<boolean> {
    if (!this.current() || this.pending()) return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const { estimatedAmount, observation } = this.model()
      if (
        !this.current() ||
        this.orders.writing() ||
        !validAmount(estimatedAmount) ||
        observation.length > 2000
      )
        return
      try {
        const result = await firstValueFrom(
          this.orders
            .createOrder(
              {
                requestId: this.context.requestId,
                estimatedAmount: estimatedAmount === "" ? null : estimatedAmount,
                observation: observation.trim() === "" ? null : observation
              },
              this.context.customerId
            )
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
          // The existing HTTP/store boundary validates target, linkage and owner.
          this.context.onCreated(result.data.order.id)
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
