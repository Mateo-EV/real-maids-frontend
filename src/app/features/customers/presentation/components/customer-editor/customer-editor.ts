import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from "@angular/core"
import { form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { firstValueFrom, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { Customer, CustomerType } from "../../../domain/entities/customer.entity"
import { CustomersStore } from "../../state/customers.store"
import { customerDialogLifecycle, customerWriteError } from "./customer-dialog-lifecycle"

export interface CustomerEditorContext {
  customer: Customer | null
  owner: DestroyRef
  onSaved: () => void
}

@Component({
  selector: "app-customer-editor",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmAlertImports,
    HlmSpinnerImports
  ],
  templateUrl: "./customer-editor.html"
})
export class CustomerEditor {
  readonly context = injectBrnDialogContext<CustomerEditorContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly customers = inject(CustomersStore)
  readonly error = signal("")
  readonly model = signal({
    name: this.context.customer?.name ?? "",
    type: this.context.customer?.type ?? CustomerType.RESIDENTIAL,
    email: this.context.customer?.email ?? "",
    phone: this.context.customer?.phone ?? ""
  })
  readonly profile = form(this.model, path => {
    validate(path.name, ({ value }) => {
      const name = value().trim()
      return !name
        ? { kind: "required", message: "Ingresa el nombre." }
        : name.length > 150
          ? { kind: "maxLength", message: "Usa como máximo 150 caracteres." }
          : undefined
    })
    validate(path.type, ({ value }) =>
      Object.values(CustomerType).includes(value())
        ? undefined
        : { kind: "type", message: "Selecciona el tipo de cliente." }
    )
    validate(path.email, ({ value }) => {
      const email = value().trim()
      return email.length > 120
        ? { kind: "maxLength", message: "Usa como máximo 120 caracteres." }
        : email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          ? { kind: "email", message: "Ingresa un correo válido." }
          : undefined
    })
    validate(path.phone, ({ value }) => {
      const phone = value().trim()
      return phone.length > 30
        ? { kind: "maxLength", message: "Usa como máximo 30 caracteres." }
        : phone && !/^\+?[0-9 ()-]{7,30}$/.test(phone)
          ? { kind: "phone", message: "Ingresa un teléfono válido de 7 a 30 caracteres." }
          : undefined
    })
  })
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set(customerWriteError("UNAUTHENTICATED"))
  )

  save(): Promise<boolean> {
    if (
      this.context.owner.destroyed ||
      !this.lifecycle.current() ||
      this.profile().submitting() ||
      this.customers.writePending()
    )
      return Promise.resolve(false)
    this.error.set("")
    return submit(this.profile, async () => {
      const value = this.model()
      const params = {
        name: value.name.trim(),
        type: value.type,
        email: value.email.trim() || null,
        phone: value.phone.trim() || null
      }
      try {
        const request = this.context.customer
          ? this.customers.updateCustomer({ id: this.context.customer.id, ...params })
          : this.customers.createCustomer(params)
        const result = await firstValueFrom(
          request.pipe(
            takeUntil(this.lifecycle.cancelled$),
            takeUntilDestroyed(this.destroyRef),
            takeUntilDestroyed(this.context.owner)
          ),
          { defaultValue: undefined }
        )
        if (this.context.owner.destroyed || !this.lifecycle.current() || !result) return
        if (!result.success) this.error.set(customerWriteError(result.error.code))
        else {
          this.context.onSaved()
          if (this.lifecycle.current()) this.dialog.close()
        }
      } catch {
        if (this.lifecycle.current()) this.error.set(customerWriteError("UNEXPECTED"))
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
