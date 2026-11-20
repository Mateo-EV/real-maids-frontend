import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal
} from "@angular/core"
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
import { CustomerErrorCode } from "../../../domain/errors/customer.error"
import { CustomersStore } from "../../state/customers.store"
import {
  customerDialogLifecycle,
  customerFieldError,
  customerWriteError
} from "./customer-dialog-lifecycle"

export interface CustomerEditorContext {
  customer: Customer | null
  owner: DestroyRef
  onSaved: () => void
}

/** Portal account state of the captured record; `none` also covers a legacy payload without a state. */
type AccountState = "none" | "active" | "inactive"

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
  /** Field-specific server failures already carry a documented marker; `null` means general alert. */
  readonly fieldError = signal<{ field: "email" | "password"; message: string } | null>(null)
  readonly account = computed<AccountState>(() => {
    const customer = this.context.customer
    if (!customer || customer.userId === null || customer.accountActive === null) return "none"
    return customer.accountActive ? "active" : "inactive"
  })
  readonly model = signal({
    name: this.context.customer?.name ?? "",
    type: this.context.customer?.type ?? CustomerType.RESIDENTIAL,
    email: this.context.customer?.email ?? "",
    phone: this.context.customer?.phone ?? "",
    // An active account starts checked: unchecking it is the explicit request to retire it.
    createAccount: this.account() === "active",
    password: ""
  })
  /** The account is being created or recreated, so a password and the customer email are required. */
  readonly accountRequested = computed(
    () => this.model().createAccount && this.account() !== "active"
  )
  readonly retireRequested = computed(
    () => this.account() === "active" && !this.model().createAccount
  )
  /** Deactivation cuts portal access immediately, so it needs an explicit second step. */
  readonly retireConfirmed = signal(false)
  readonly retireBlocked = computed(() => this.retireRequested() && !this.retireConfirmed())
  readonly accountStateLabel = computed(() => {
    switch (this.account()) {
      case "active":
        return "activa"
      case "inactive":
        return "desactivada"
      default:
        return "sin cuenta"
    }
  })
  readonly accountToggleLabel = computed(() => {
    switch (this.account()) {
      case "active":
        return "Mantener la cuenta del portal activa"
      case "inactive":
        return "Recrear la cuenta del portal"
      default:
        return "Crear cuenta del portal"
    }
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
        : !email && this.accountRequested()
          ? {
              kind: "accountEmail",
              message: "La cuenta del portal necesita el correo del cliente."
            }
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
    validate(path.password, ({ value }) =>
      this.accountRequested() && value().length === 0
        ? { kind: "required", message: "La cuenta del portal necesita una contraseña inicial." }
        : undefined
    )
  })
  private readonly lifecycle = customerDialogLifecycle(
    () => this.cancel(),
    () => this.error.set(customerWriteError("UNAUTHENTICATED"))
  )

  /**
   * The tri-state the form emits. `undefined` is the absent state that never touches the account;
   * `true` creates/reactivates and `false` retires an active account. Password bytes are never
   * trimmed and only travel with `true`.
   */
  private accountParams(): { createAccount?: boolean; password?: string } {
    if (this.account() === "active") {
      if (this.model().createAccount) return {}
      return this.retireConfirmed() ? { createAccount: false } : {}
    }
    return this.model().createAccount
      ? { createAccount: true, password: this.model().password }
      : {}
  }
  private reportFailure(code: CustomerErrorCode): void {
    const field = customerFieldError(code)
    if (field && (field.field === "email" || this.accountRequested())) {
      this.error.set("")
      this.fieldError.set(field)
      return
    }
    this.fieldError.set(null)
    this.error.set(field ? field.message : customerWriteError(code))
  }
  clearFieldError(): void {
    this.fieldError.set(null)
  }
  /** Any account toggle starts the confirmation over: it belongs to the current desired state. */
  accountToggled(): void {
    this.retireConfirmed.set(false)
    this.clearFieldError()
  }
  confirmRetire(): void {
    this.retireConfirmed.set(true)
    this.clearFieldError()
  }
  keepAccount(): void {
    this.model.update(value => ({ ...value, createAccount: true }))
    this.retireConfirmed.set(false)
    this.clearFieldError()
  }
  save(): Promise<boolean> {
    if (
      this.context.owner.destroyed ||
      !this.lifecycle.current() ||
      this.profile().submitting() ||
      this.customers.writePending() ||
      this.retireBlocked()
    )
      return Promise.resolve(false)
    this.error.set("")
    this.fieldError.set(null)
    return submit(this.profile, async () => {
      if (this.retireBlocked()) return
      const value = this.model()
      const params = {
        name: value.name.trim(),
        type: value.type,
        email: value.email.trim() || null,
        phone: value.phone.trim() || null,
        ...this.accountParams()
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
        if (!result.success) this.reportFailure(result.error.code)
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
