import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal
} from "@angular/core"
import {
  email,
  form,
  FormField,
  FormRoot,
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
import { DEMO_PASSWORD_PLACEHOLDER } from "../../demo/users-demo.fixture"

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
    age: this.context.user?.age ?? 0,
    email: this.context.user?.email ?? "",
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
    validate(path.age, ({ value }) =>
      Number.isInteger(value()) && value() >= 0
        ? undefined
        : { kind: "age", message: "Ingresa una edad entera no negativa." }
    )
    required(path.roleId, { message: "Selecciona un rol." })
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
        roleId: Number(value.roleId)
      }
      try {
        const request = this.context.user
          ? this.users.updateUserById(this.context.user.id, params)
          : this.users.createUser({ ...params, password: DEMO_PASSWORD_PLACEHOLDER })
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
