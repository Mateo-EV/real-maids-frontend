import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal
} from "@angular/core"
import { FIELD_STAFF_ROLE_NAME } from "@/app/features/auth/presentation/routing/audience-navigation"
import {
  applyWhen,
  email,
  form,
  FormField,
  FormRoot,
  minLength,
  maxLength,
  required,
  submit,
  validate
} from "@angular/forms/signals"
import { firstValueFrom } from "rxjs"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { connectUserDialogDismissal } from "../user-dialog-dismissal"
import { BrnDialogRef, injectBrnDialogContext } from "@spartan-ng/brain/dialog"
import { HlmDialogImports } from "@spartan-ng/helm/dialog"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmNativeSelectImports } from "@spartan-ng/helm/native-select"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { Lang, User } from "../../../domain/entities/user.entity"
import { UserErrorCode } from "../../../domain/errors/user.error"
import {
  CUSTOMER_ROLE_NAME,
  CreateUserParams,
  CustomerType,
  isCustomerType
} from "../../../domain/params/create-user.params"
import { RolesStore } from "../../state/roles.store"
import { UserStore } from "../../state/user.store"
import { UserSavedEvent, userFieldError, userWriteError } from "./user-write-feedback"

export interface UserEditorContext {
  user: User | null
  onSaved: (saved?: UserSavedEvent) => void
}

/**
 * Identity, not ACL: `PERSONAL_CAMPO` is the label `PerfilResponse.rol` returns for the field staff
 * audience, the same one the auth routing names `FIELD_STAFF_ROLE_NAME`.
 */

@Component({
  selector: "app-user-editor",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    FormRoot,
    HlmDialogImports,
    HlmButtonImports,
    HlmFieldImports,
    HlmInputImports,
    HlmNativeSelectImports,
    HlmSpinnerImports,
    HlmAlertImports
  ],
  templateUrl: "./user-editor.html",
  styleUrl: "./user-editor.css"
})
export class UserEditor {
  readonly context = injectBrnDialogContext<UserEditorContext>()
  private readonly dialog = inject(BrnDialogRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly users = inject(UserStore)
  readonly roles = inject(RolesStore)
  readonly error = signal("")
  /** Documented 409 marker rendered on the email input instead of the general alert. */
  readonly emailError = signal("")
  readonly model = signal({
    name: this.context.user?.name ?? "",
    email: this.context.user?.email ?? "",
    password: "",
    lang: this.context.user?.lang ?? Lang.ES,
    isActive: this.context.user?.isActive ?? true,
    roleId: this.context.user ? String(this.context.user.roleId) : "",
    customerType: "" as CustomerType | "",
    phone: ""
  })
  readonly availableRoles = computed(() =>
    this.roles.roles().filter(role => role.isActive || role.id === this.context.user?.roleId)
  )
  readonly selectedRole = computed(() =>
    this.availableRoles().find(role => String(role.id) === this.model().roleId)
  )
  /**
   * Only a new CLIENTE account creates the customer row; editing sends the profile `PUT`, which
   * has no `tipo`/`telefono` and never creates a customer.
   */
  readonly customerAccountRequired = computed(
    () => !this.context.user && this.selectedRole()?.name === CUSTOMER_ROLE_NAME
  )
  /**
   * Only a new PERSONAL_CAMPO account is announced: the staff record that decides what «Mis
   * servicios» shows is linked from RRHH, never from this alta, so editing keeps its flow.
   */
  readonly staffAccountNotice = computed(
    () => !this.context.user && this.selectedRole()?.name === FIELD_STAFF_ROLE_NAME
  )
  readonly userForm = form(this.model, path => {
    // required(path.name, { message: "Ingresa el nombre." })
    validate(path.name, ({ value }) =>
      value().trim() ? undefined : { kind: "required", message: "Ingresa el nombre." }
    )
    required(path.email, { message: "Ingresa el correo." })
    email(path.email, { message: "Ingresa un correo válido." })
    applyWhen(
      path.password,
      ({ value }) => value() !== "" || !this.context.user,
      password => {
        minLength(password, 8, { message: "La contraseña debe tener al menos 8 caracteres." })
        maxLength(password, 64, { message: "La contraseña no puede superar 64 caracteres." })
      }
    )
    validate(path.password, ({ value }) => {
      const password = value()
      if (password === "" && this.context.user) return undefined
      if (password === "") return { kind: "required", message: "Ingresa la contraseña." }
      return password.length >= 8 &&
        password.length <= 64 &&
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(password)
        ? undefined
        : {
            kind: "password",
            message: "Usa de 8 a 64 caracteres, con mayúscula, minúscula y número."
          }
    })
    // required(path.roleId, { message: "Selecciona un rol." })
    validate(path.roleId, ({ value }) =>
      this.availableRoles().some(role => String(role.id) === value())
        ? undefined
        : { kind: "role", message: "Selecciona un rol disponible." }
    )
    // The customer row created with a CLIENTE account requires its type; the other roles never
    // request a customer, so these fields stay valid and unused for them.
    validate(path.customerType, ({ value }) =>
      this.customerAccountRequired() && !isCustomerType(value())
        ? { kind: "customerType", message: "Selecciona el tipo de cliente." }
        : undefined
    )
    validate(path.phone, ({ value }) => {
      if (!this.customerAccountRequired()) return undefined
      const phone = value().trim()
      return phone && !/^\+?[0-9 ()-]{7,30}$/.test(phone)
        ? { kind: "phone", message: "Ingresa un teléfono válido de 7 a 30 caracteres." }
        : undefined
    })
    validate(path.lang, ({ value }) =>
      value() === Lang.ES || value() === Lang.EN
        ? undefined
        : { kind: "language", message: "Selecciona el idioma." }
    )
  })

  constructor() {
    connectUserDialogDismissal(this.destroyRef, () => this.cancel())
  }

  save(): Promise<boolean> {
    if (this.destroyRef.destroyed || this.userForm().submitting()) return Promise.resolve(false)
    this.error.set("")
    this.emailError.set("")
    return submit(this.userForm, async () => {
      const value = this.model()
      const customerCreated = this.customerAccountRequired()
      // Defense in depth: the form already requires the type, and nothing leaves without it.
      if (customerCreated && !isCustomerType(value.customerType)) return undefined
      const params: CreateUserParams = {
        name: value.name.trim(),
        email: value.email.trim(),
        password: value.password,
        lang: value.lang,
        isActive: value.isActive,
        roleId: Number(value.roleId),
        ...this.customerParams()
      }
      try {
        const request = this.context.user
          ? this.users.updateUserById(this.context.user.id, {
              ...params,
              ...(params.password ? { password: params.password } : {})
            })
          : this.users.createUser(params)
        const result = await firstValueFrom(request.pipe(takeUntilDestroyed(this.destroyRef)), {
          defaultValue: undefined
        })
        if (this.destroyRef.destroyed || !result) return undefined
        if (result.success) {
          this.context.onSaved({
            created: !this.context.user,
            customerCreated,
            customerId: result.data.customerId
          })
          this.dialog.close()
        } else {
          this.reportFailure(result.error.code, customerCreated)
        }
      } catch {
        if (this.destroyRef.destroyed) return undefined
        this.reportFailure("UNEXPECTED", customerCreated)
      }
      return undefined
    })
  }

  /** The email is shared between accounts and customers, so its conflict stays on that input. */
  private reportFailure(code: UserErrorCode, customerCreated: boolean): void {
    const field = userFieldError(code)
    if (field) {
      this.error.set("")
      this.emailError.set(field.message)
      return
    }
    this.emailError.set("")
    this.error.set(userWriteError(code, { customerCreated }))
  }

  clearEmailError(): void {
    this.emailError.set("")
  }

  /** Leaving CLIENTE drops the account-only fields and their validation state. */
  roleChanged(): void {
    this.error.set("")
    this.emailError.set("")
    if (this.customerAccountRequired()) return
    this.model.update(value => ({ ...value, customerType: "", phone: "" }))
    this.userForm.customerType().reset()
    this.userForm.phone().reset()
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.userForm().submitting() && this.dialog.open)
      this.dialog.close()
  }

  /** Account-only data travels only with a CLIENTE alta; the other roles never see these keys. */
  private customerParams(): Pick<CreateUserParams, "customerType" | "phone"> {
    if (!this.customerAccountRequired()) return {}
    const phone = this.model().phone.trim()
    const customerType = this.model().customerType
    return {
      ...(customerType ? { customerType } : {}),
      ...(phone ? { phone } : {})
    }
  }
}
