import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CustomerType } from "../../../domain/entities/customer.entity"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"
import {
  customerDialogLifecycle,
  customerWriteError
} from "../customer-editor/customer-dialog-lifecycle"

interface ConversionContext {
  leadId: number
  name: string
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  onConfirmed: (customerId: number) => void
}
@Component({
  selector: "app-lead-conversion-dialog",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmNativeSelectImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./lead-conversion-dialog.html"
})
export class LeadConversionDialog {
  readonly context = injectBrnDialogContext<ConversionContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly store = inject(CustomerAcquisitionStore)
  readonly error = signal("")
  readonly types = [
    { value: CustomerType.RESIDENTIAL, label: "Residencial" },
    { value: CustomerType.COMMERCIAL, label: "Comercial" }
  ]
  readonly model = signal({ type: "" })
  private selectedType(): CustomerType | undefined {
    return this.types.find(type => type.value === this.model().type)?.value
  }
  readonly profile = form(this.model, path => {
    validate(path.type, () =>
      this.selectedType()
        ? undefined
        : { kind: "choice", message: "Selecciona el tipo de cliente." }
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
    if (!this.current() || this.profile().submitting() || this.store.writing())
      return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const type = this.selectedType()
      if (!type || !this.current()) return
      try {
        const result = await firstValueFrom(
          this.store
            .convertLead({ leadId: this.context.leadId, type })
            .pipe(
              takeUntil(this.context.ownerChanged$),
              takeUntil(this.lifecycle.cancelled$),
              takeUntilDestroyed(this.destroyRef),
              takeUntilDestroyed(this.context.owner)
            ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success) {
          this.error.set(
            result.error.code === "LEAD_NOT_FOUND"
              ? "El prospecto ya no está disponible. Cierra y vuelve a consultarlo."
              : result.error.code === "NETWORK"
                ? "No se pudo confirmar la conversión. Consulta el prospecto antes de reintentar; la solicitud pudo haberse procesado."
                : customerWriteError(result.error.code)
          )
        } else {
          // The HTTP boundary validates the full Customer and captured lead ownership.
          // Repeats can return a previously linked customer with a different stored type.
          const customer = result.data
          if (
            customer.leadId !== this.context.leadId ||
            !Number.isInteger(customer.id) ||
            customer.id <= 0 ||
            customer.id > 2147483647
          ) {
            this.error.set(customerWriteError("INVALID_RESPONSE"))
            return
          }
          this.context.onConfirmed(customer.id)
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current())
          this.error.set(
            "No se pudo confirmar la conversión. Consulta el prospecto antes de reintentar."
          )
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
