import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { form, FormField, FormRoot, submit, validate } from "@angular/forms/signals"
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { CustomerType } from "../../../domain/entities/customer.entity"
import { CustomerErrorCode } from "../../../domain/errors/customer.error"
import { CustomerAcquisitionStore } from "../../state/customer-acquisition.store"
import {
  customerDialogLifecycle,
  customerFieldError,
  customerWriteError
} from "../customer-editor/customer-dialog-lifecycle"

interface ConversionContext {
  leadId: number
  name: string
  owner: DestroyRef
  ownerChanged$: Observable<void>
  current: () => boolean
  /** The account flag is the caller's request, not a server field: conversion returns a Customer. */
  onConfirmed: (customerId: number, accountCreated: boolean) => void
}

/**
 * Field-specific conversion failures. The account markers keep their documented meaning, but their
 * copy is conversion-specific: the email is not typed here, the server copies it from the prospect.
 */
function conversionFieldError(code: CustomerErrorCode) {
  switch (code) {
    case "ACCOUNT_EMAIL_REQUIRED":
      return {
        field: "email" as const,
        message:
          "La cuenta del portal necesita el correo del prospecto. Agrégalo al prospecto antes de convertir."
      }
    case "EMAIL_RESERVED":
      return {
        field: "email" as const,
        message:
          "El correo del prospecto ya está reservado por otro cliente o por una cuenta del portal, incluso inactiva."
      }
    default:
      return customerFieldError(code)
  }
}

/** `403` is authoritative and never rendered as server copy; conversion needs both permissions. */
function conversionWriteError(code: CustomerErrorCode): string {
  switch (code) {
    case "FORBIDDEN":
      return "No tienes permisos para convertir prospectos: se necesitan permisos para crear y actualizar clientes."
    case "LEAD_NOT_FOUND":
      return "El prospecto ya no está disponible. Cierra y vuelve a consultarlo."
    case "NETWORK":
      return "No se pudo confirmar la conversión. Consulta el prospecto antes de reintentar; la solicitud pudo haberse procesado."
    default:
      return customerWriteError(code)
  }
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
    HlmInputImports,
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
  /** A documented marker owns one input; `null` means the general alert instead. */
  readonly fieldError = signal<{ field: "email" | "password"; message: string } | null>(null)
  readonly types = [
    { value: CustomerType.RESIDENTIAL, label: "Residencial" },
    { value: CustomerType.COMMERCIAL, label: "Comercial" }
  ]
  // The account choice is off by default so an untouched conversion keeps behaving as before.
  readonly model = signal({ type: "", createAccount: false, password: "" })
  readonly createAccount = () => this.model().createAccount
  private selectedType(): CustomerType | undefined {
    return this.types.find(type => type.value === this.model().type)?.value
  }
  readonly profile = form(this.model, path => {
    validate(path.type, () =>
      this.selectedType()
        ? undefined
        : { kind: "choice", message: "Selecciona el tipo de cliente." }
    )
    validate(path.password, ({ value }) =>
      this.createAccount() && value().length === 0
        ? { kind: "required", message: "La cuenta del portal necesita una contraseña inicial." }
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
  clearFieldError(): void {
    this.fieldError.set(null)
  }
  /** The marker belongs to the current choice, so changing it starts the feedback over. */
  accountToggled(): void {
    this.clearFieldError()
  }
  /**
   * The account intent that travels with the confirmation: the flag is explicit `true` only when the
   * choice is ticked, and an unticked box sends no account key at all. Password bytes are never
   * trimmed and only travel with `true`.
   */
  private accountParams(): { createAccount: boolean; password: string } | undefined {
    return this.createAccount()
      ? { createAccount: true, password: this.model().password }
      : undefined
  }
  private reportFailure(code: CustomerErrorCode): void {
    const field = conversionFieldError(code)
    if (field && (field.field === "email" || this.createAccount())) {
      this.error.set("")
      this.fieldError.set(field)
      return
    }
    this.fieldError.set(null)
    this.error.set(field ? field.message : conversionWriteError(code))
  }
  save(): Promise<boolean> {
    if (!this.current() || this.profile().submitting() || this.store.writing())
      return Promise.resolve(false)
    this.error.set("")
    this.fieldError.set(null)
    return submit(this.profile, async () => {
      const type = this.selectedType()
      if (!type || !this.current()) return
      const account = this.accountParams()
      try {
        const result = await firstValueFrom(
          this.store
            .convertLead({
              leadId: this.context.leadId,
              type,
              ...(account ?? {})
            })
            .pipe(
              takeUntil(this.context.ownerChanged$),
              takeUntil(this.lifecycle.cancelled$),
              takeUntilDestroyed(this.destroyRef),
              takeUntilDestroyed(this.context.owner)
            ),
          { defaultValue: undefined }
        )
        if (!this.current() || !result) return
        if (!result.success) this.reportFailure(result.error.code)
        else {
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
          this.context.onConfirmed(customer.id, !!account)
          if (this.current()) this.dialog.close()
        }
      } catch {
        if (this.current()) this.error.set(conversionWriteError("NETWORK"))
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
