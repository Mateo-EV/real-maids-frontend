import { AuthError } from "@/app/features/auth/domain/errors/auth.error"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  output,
  signal
} from "@angular/core"
import {
  email,
  form,
  FormField,
  FormRoot,
  minLength,
  required,
  submit as submitForm
} from "@angular/forms/signals"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideArrowRight, lucideCircleAlert, lucideEye, lucideEyeOff } from "@ng-icons/lucide"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmCardImports } from "@spartan-ng/helm/card"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { firstValueFrom } from "rxjs"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"

@Component({
  imports: [
    FormField,
    FormRoot,
    NgIcon,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmCardImports,
    ...HlmFieldImports,
    ...HlmInputImports,
    ...HlmInputGroupImports,
    ...HlmSpinnerImports
  ],
  selector: "app-login-form",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideCircleAlert,
      lucideEye,
      lucideEyeOff
    })
  ],
  styles: `
    :host {
      display: block;
    }
  `,
  templateUrl: "./login-form.html"
})
export class LoginFormComponent {
  private readonly authStore = inject(AuthStore)
  private readonly destroyRef = inject(DestroyRef)

  readonly authenticated = output<void>()
  readonly passwordVisible = signal(false)
  readonly submitError = signal<AuthError | null>(null)
  readonly loginModel = signal({ email: "", password: "" })
  readonly loginForm = form(this.loginModel, path => {
    required(path.email, { message: "Ingresa tu correo electrónico." })
    email(path.email, { message: "Ingresa un correo válido." })
    required(path.password, { message: "Ingresa tu contraseña." })
    minLength(path.password, 8, {
      message: "La contraseña debe tener al menos 8 caracteres."
    })
  })

  togglePasswordVisibility(): void {
    this.passwordVisible.update(visible => !visible)
  }

  clearSubmitError(): void {
    this.submitError.set(null)
  }

  submit(): Promise<boolean> {
    if (this.destroyRef.destroyed || this.loginForm().submitting()) return Promise.resolve(false)
    this.submitError.set(null)

    return submitForm(this.loginForm, async loginForm => {
      const { email, password } = loginForm().value()
      try {
        const result = await firstValueFrom(
          this.authStore
            .login({ email: email.trim(), password })
            .pipe(takeUntilDestroyed(this.destroyRef)),
          { defaultValue: undefined }
        )
        if (this.destroyRef.destroyed || !result) return undefined
        if (result.success) {
          this.authenticated.emit()
        } else {
          this.submitError.set(result.error)
        }
      } catch (error) {
        console.error(error)
        if (!this.destroyRef.destroyed) this.submitError.set(new AuthError("UNEXPECTED"))
      }

      return undefined
    })
  }
}
