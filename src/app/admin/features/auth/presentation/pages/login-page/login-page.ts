import { AuthError } from "@/app/admin/features/auth/application/errors/auth.error"
import { AuthService } from "@/app/admin/features/auth/application/services/auth.service"
import { DEMO_AUTH } from "@/app/admin/features/auth/auth.demo"
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core"
import {
  email,
  form,
  FormField,
  FormRoot,
  minLength,
  required,
  submit as submitForm
} from "@angular/forms/signals"
import { ActivatedRoute, Router } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import {
  lucideArrowRight,
  lucideCheck,
  lucideCircleAlert,
  lucideEye,
  lucideEyeOff,
  lucideSparkles
} from "@ng-icons/lucide"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmCardImports } from "@spartan-ng/helm/card"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { firstValueFrom } from "rxjs"

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
  selector: "app-login-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideCheck,
      lucideCircleAlert,
      lucideEye,
      lucideEyeOff,
      lucideSparkles
    })
  ],
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
    }
  `,
  templateUrl: "./login-page.html"
})
export class LoginPage {
  private readonly authService = inject(AuthService)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)

  readonly demoAuth = DEMO_AUTH
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

  fillDemoCredentials(): void {
    this.loginForm().reset({
      email: this.demoAuth.email,
      password: this.demoAuth.password
    })
    this.submitError.set(null)
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update(visible => !visible)
  }

  clearSubmitError(): void {
    this.submitError.set(null)
  }

  submit(): Promise<boolean> {
    this.submitError.set(null)

    return submitForm(this.loginForm, async loginForm => {
      const { email, password } = loginForm().value()
      const result = await firstValueFrom(this.authService.login({ email: email.trim(), password }))

      if (result.success) {
        await this.router.navigateByUrl(this.safeReturnUrl())
      } else {
        this.submitError.set(result.error)
      }

      return undefined
    })
  }

  private safeReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get("returnUrl")
    return returnUrl?.startsWith("/") && !returnUrl.startsWith("//") ? returnUrl : "/admin"
  }
}
