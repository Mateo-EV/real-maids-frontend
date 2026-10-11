import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal
} from "@angular/core"
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
import { RolesStore } from "../../state/roles.store"
import { UserStore } from "../../state/user.store"

export interface UserEditorContext {
  user: User | null
  onSaved: () => void
}

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
  readonly model = signal({
    name: this.context.user?.name ?? "",
    email: this.context.user?.email ?? "",
    password: "",
    lang: this.context.user?.lang ?? Lang.ES,
    isActive: this.context.user?.isActive ?? true,
    roleId: this.context.user ? String(this.context.user.roleId) : ""
  })
  readonly availableRoles = computed(() =>
    this.roles.roles().filter(role => role.isActive || role.id === this.context.user?.roleId)
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
    return submit(this.userForm, async () => {
      const value = this.model()
      const params = {
        ...value,
        name: value.name.trim(),
        email: value.email.trim(),
        password: value.password,
        roleId: Number(value.roleId)
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
          this.context.onSaved()
          this.dialog.close()
        } else {
          this.error.set(
            result.error.code === "USER_NOT_FOUND"
              ? "El usuario ya no existe. Cierra y vuelve al catálogo."
              : result.error.code === "PARTIAL_UPDATE"
                ? "El perfil se actualizó, pero no se completó el estado o la contraseña. Revisa el catálogo antes de reintentar."
                : result.error.code === "FORBIDDEN"
                  ? "No tienes permiso para guardar estos cambios."
                  : result.error.code === "EMAIL_ALREADY_EXISTS"
                    ? "El correo ya está registrado."
                    : "No pudimos guardar el usuario. Inténtalo de nuevo."
          )
        }
      } catch {
        if (this.destroyRef.destroyed) return undefined
        this.error.set("No pudimos guardar el usuario. Inténtalo de nuevo.")
      }
      return undefined
    })
  }

  cancel(): void {
    if (!this.destroyRef.destroyed && !this.userForm().submitting() && this.dialog.open)
      this.dialog.close()
  }
}
