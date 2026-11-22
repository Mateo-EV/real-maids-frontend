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
import { firstValueFrom, Observable, takeUntil } from "rxjs"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { FieldStaffSummary } from "../../../domain/models/field-staff-summary"
import { StaffAccountFailure } from "../../../domain/repositories/field-operations.repository"
import { FieldOperationsError } from "../../../domain/errors/field-operations.error"
import {
  CreateFieldStaffUseCase,
  UpdateFieldStaffUseCase
} from "../../../application/use-cases/field-staff.use-cases"
import { staffDialogLifecycle, staffFieldError, staffWriteError } from "./staff-dialog-lifecycle"

export interface StaffEditorContext {
  /** The captured record, or `null` to register a new employee. */
  staff: FieldStaffSummary | null
  owner: DestroyRef
  onSaved: () => void
  /** Emitted by the record page when its route owner changes; the captured record is gone then. */
  ownerChanged$?: Observable<unknown>
}

/**
 * Access-account state of the captured record, derived only from what `PersonalResponse` documents:
 * `correoUsuario` present means an active account; absent means the record has no access, even when
 * `idUsuario` still points at the retained (deactivated) row.
 */
type AccountState = "none" | "inactive" | "active"

@Component({
  selector: "app-staff-editor",
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
  templateUrl: "./staff-editor.html"
})
export class StaffEditor {
  readonly context = injectBrnDialogContext<StaffEditorContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly createStaff = inject(CreateFieldStaffUseCase)
  private readonly updateStaff = inject(UpdateFieldStaffUseCase)
  readonly error = signal("")
  /** Field-specific server failures already carry a documented marker; `null` means general alert. */
  readonly fieldError = signal<{ field: "email" | "password"; message: string } | null>(null)
  /** The captured record stopped matching the route; late results must not reach the UI. */
  private detached = false
  readonly account = computed<AccountState>(() => {
    const staff = this.context.staff
    if (!staff) return "none"
    if (staff.accountEmail) return "active"
    // A retained identifier without an active account is the deactivated row, logically "sin cuenta".
    return staff.userId === null ? "none" : "inactive"
  })
  readonly model = signal({
    name: this.context.staff?.name ?? "",
    document: this.context.staff?.document ?? "",
    phone: this.context.staff?.phone ?? "",
    email: this.context.staff?.email ?? "",
    language: this.context.staff?.language ?? "es",
    joinedOn: this.context.staff?.joinedOn ?? "",
    // An active account starts checked: unchecking it is the explicit request to retire it.
    createAccount: this.account() === "active",
    password: ""
  })
  /** The account is being created or recreated, so a password and the staff email are required. */
  readonly accountRequested = computed(
    () => this.model().createAccount && this.account() !== "active"
  )
  readonly retireRequested = computed(
    () => this.account() === "active" && !this.model().createAccount
  )
  /** Retiring access cuts the session immediately, so it needs an explicit second step. */
  readonly retireConfirmed = signal(false)
  readonly retireBlocked = computed(() => this.retireRequested() && !this.retireConfirmed())
  // A retained identifier with no active account is logically "sin cuenta": it never reads "activa".
  readonly accountStateLabel = computed(() =>
    this.account() === "active" ? "activa" : "sin cuenta de acceso"
  )
  readonly accountDescription = computed(() =>
    // The identifier of a retired row is never shown: only the logical absence matters here.
    this.account() === "active"
      ? "La ficha tiene acceso activo con este correo."
      : "Esta ficha no tiene cuenta de acceso activa: no puede consultar sus servicios."
  )
  readonly accountToggleLabel = computed(() => {
    switch (this.account()) {
      case "active":
        return "Mantener la cuenta de acceso activa"
      case "inactive":
        return "Recrear la cuenta de acceso"
      default:
        return "Crear cuenta de acceso"
    }
  })
  readonly profile = form(this.model, path => {
    validate(path.name, ({ value }) => {
      const name = value().trim()
      return !name
        ? { kind: "required", message: "Ingresa el nombre." }
        : name.length > 150
          ? { kind: "maxLength", message: "Usa como máximo 150 caracteres." }
          : /^\p{L}[\p{L} .'-]*$/u.test(name)
            ? undefined
            : {
                kind: "name",
                message: "El nombre solo admite letras, espacios, punto, apóstrofo y guion."
              }
    })
    validate(path.document, ({ value }) => {
      const document = value().trim()
      return !document
        ? { kind: "required", message: "Ingresa el documento." }
        : !/^[A-Za-z0-9-]{4,30}$/.test(document)
          ? {
              kind: "document",
              message: "El documento admite letras, dígitos y guiones (4 a 30)."
            }
          : undefined
    })
    validate(path.email, ({ value }) => {
      const email = value().trim()
      return email.length > 120
        ? { kind: "maxLength", message: "Usa como máximo 120 caracteres." }
        : !email && this.accountRequested()
          ? {
              kind: "accountEmail",
              message: "La cuenta de acceso necesita el correo de la ficha."
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
    validate(path.language, ({ value }) =>
      value() === "es" || value() === "en"
        ? undefined
        : { kind: "language", message: "Selecciona el idioma." }
    )
    validate(path.password, ({ value }) =>
      this.accountRequested() && value().length === 0
        ? { kind: "required", message: "La cuenta de acceso necesita una contraseña inicial." }
        : undefined
    )
  })
  private readonly lifecycle = staffDialogLifecycle(
    () => this.cancel(),
    () => this.error.set(staffWriteError("UNAUTHENTICATED"))
  )

  constructor() {
    this.context.ownerChanged$?.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      // The captured record no longer matches the route, so this dialog cannot apply to the new one.
      this.detached = true
      if (!this.destroyRef.destroyed && this.dialog.open) this.dialog.close()
    })
  }

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
  private reportFailure(error: FieldOperationsError): void {
    if (error instanceof StaffAccountFailure) {
      const field = staffFieldError(error.reason)
      // A password marker can only be fixed where the password input is visible.
      if (field.field === "email" || this.accountRequested()) {
        this.error.set("")
        this.fieldError.set(field)
        return
      }
      this.fieldError.set(null)
      this.error.set(field.message)
      return
    }
    this.fieldError.set(null)
    this.error.set(staffWriteError(error.code))
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
      this.detached ||
      !this.lifecycle.current() ||
      this.profile().submitting() ||
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
        document: value.document.trim(),
        phone: value.phone.trim() || null,
        email: value.email.trim() || null,
        language: value.language,
        joinedOn: value.joinedOn || null,
        ...this.accountParams()
      }
      try {
        const request = this.context.staff
          ? this.updateStaff.execute(this.context.staff.id, params)
          : this.createStaff.execute(params)
        const result = await firstValueFrom(
          request.pipe(
            takeUntil(this.lifecycle.cancelled$),
            takeUntilDestroyed(this.destroyRef),
            takeUntilDestroyed(this.context.owner)
          ),
          { defaultValue: undefined }
        )
        if (this.context.owner.destroyed || this.detached || !this.lifecycle.current() || !result)
          return
        if (!result.success) this.reportFailure(result.error)
        else {
          this.context.onSaved()
          if (this.lifecycle.current() && !this.detached) this.dialog.close()
        }
      } catch {
        if (this.lifecycle.current() && !this.detached) this.error.set(staffWriteError("UNKNOWN"))
      }
    })
  }
  cancel(): void {
    if (!this.destroyRef.destroyed && !this.profile().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
