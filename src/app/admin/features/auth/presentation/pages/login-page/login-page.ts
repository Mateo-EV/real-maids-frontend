import { AuthError } from "@/app/admin/features/auth/application/errors/auth.error"
import { AuthService } from "@/app/admin/features/auth/application/services/auth.service"
import { DEMO_AUTH } from "@/app/admin/features/auth/auth.demo"
import { ChangeDetectionStrategy, Component, inject, signal } from "@angular/core"
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from "@angular/forms"
import { ActivatedRoute, Router } from "@angular/router"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
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
import { finalize, merge } from "rxjs"

@Component({
  imports: [
    ReactiveFormsModule,
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
  private readonly formBuilder = inject(NonNullableFormBuilder)
  private readonly authService = inject(AuthService)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)

  readonly demoAuth = DEMO_AUTH
  readonly loading = signal(false)
  readonly passwordVisible = signal(false)
  readonly submitError = signal<AuthError | null>(null)

  readonly form = this.formBuilder.group({
    email: ["", [Validators.required, Validators.email]],
    password: ["", [Validators.required, Validators.minLength(8)]]
  })

  constructor() {
    merge(this.form.controls.email.valueChanges, this.form.controls.password.valueChanges)
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.submitError.set(null))
  }

  fillDemoCredentials(): void {
    this.form.setValue({
      email: this.demoAuth.email,
      password: this.demoAuth.password
    })
    this.form.markAsPristine()
    this.form.markAsUntouched()
  }

  togglePasswordVisibility(): void {
    this.passwordVisible.update(visible => !visible)
  }

  submit(): void {
    if (this.loading()) {
      return
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched()
      return
    }

    this.loading.set(true)
    this.submitError.set(null)

    const { email, password } = this.form.getRawValue()

    this.authService
      .login({ email: email.trim(), password })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe(result => {
        result.either(
          () => void this.router.navigateByUrl(this.safeReturnUrl()),
          error => this.submitError.set(error)
        )
      })
  }

  private safeReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get("returnUrl")
    return returnUrl?.startsWith("/") && !returnUrl.startsWith("//") ? returnUrl : "/admin"
  }
}
