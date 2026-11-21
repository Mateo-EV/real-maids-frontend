import { passwordPolicyMessage } from "@/app/features/auth/domain/password-policy"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  output,
  signal
} from "@angular/core"
import { form, FormField, FormRoot, submit as submitForm, validate } from "@angular/forms/signals"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import { NgIcon, provideIcons } from "@ng-icons/core"
import {
  lucideCircleAlert,
  lucideEye,
  lucideEyeOff,
  lucideRefreshCw,
  lucideShieldCheck
} from "@ng-icons/lucide"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmFieldImports } from "@spartan-ng/helm/field"
import { HlmInputImports } from "@spartan-ng/helm/input"
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group"
import { HlmSpinnerImports } from "@spartan-ng/helm/spinner"
import { firstValueFrom } from "rxjs"

/** `rejected` is a documented 400; `unconfirmed` is a change whose result the client cannot prove. */
export type ChangePasswordFailure = "rejected" | "unconfirmed"

@Component({
  selector: "app-change-password-form",
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormField,
    FormRoot,
    NgIcon,
    ...HlmAlertImports,
    ...HlmButtonImports,
    ...HlmFieldImports,
    ...HlmInputImports,
    ...HlmInputGroupImports,
    ...HlmSpinnerImports
  ],
  providers: [
    provideIcons({ lucideCircleAlert, lucideEye, lucideEyeOff, lucideRefreshCw, lucideShieldCheck })
  ],
  templateUrl: "./change-password-form.html"
})
export class ChangePasswordFormComponent {
  private readonly authStore = inject(AuthStore)
  private readonly destroyRef = inject(DestroyRef)

  readonly changed = output<void>()
  readonly failure = signal<ChangePasswordFailure | null>(null)
  readonly checking = signal(false)
  readonly newPasswordVisible = signal(false)
  readonly model = signal({ currentPassword: "", newPassword: "", confirmPassword: "" })
  readonly passwordForm = form(this.model, path => {
    validate(path.currentPassword, ({ value }) =>
      value() ? undefined : { kind: "required", message: "Ingresa tu contraseña actual." }
    )
    validate(path.newPassword, ({ value }) => {
      const next = value()
      if (!next) return { kind: "required", message: "Ingresa la contraseña nueva." }
      const policy = passwordPolicyMessage(next)
      if (policy) return { kind: "password", message: policy }
      return next === this.model().currentPassword
        ? {
            kind: "unchanged",
            message: "La nueva contraseña debe ser distinta de la actual."
          }
        : undefined
    })
    validate(path.confirmPassword, ({ value }) => {
      if (!value()) return { kind: "required", message: "Repite la contraseña nueva." }
      return value() === this.model().newPassword
        ? undefined
        : {
            kind: "confirmation",
            message: "La confirmación no coincide con la contraseña nueva."
          }
    })
  })

  toggleNewPasswordVisibility(): void {
    this.newPasswordVisible.update(visible => !visible)
  }

  clearFailure(): void {
    this.failure.set(null)
  }

  submit(): Promise<boolean> {
    if (this.destroyRef.destroyed || this.passwordForm().submitting()) return Promise.resolve(false)
    this.failure.set(null)
    return submitForm(this.passwordForm, async () => {
      // Password bytes are sent as typed: never trimmed, logged or persisted here.
      const { currentPassword, newPassword } = this.model()
      try {
        const result = await firstValueFrom(
          this.authStore
            .changePassword({ currentPassword, newPassword })
            .pipe(takeUntilDestroyed(this.destroyRef)),
          { defaultValue: undefined }
        )
        if (this.destroyRef.destroyed || !result) return undefined
        if (!result.success) {
          // Cancellation means the session changed underneath: nothing to report here.
          if (result.error.code !== "CANCELLED")
            this.failure.set(
              result.error.code === "INVALID_PASSWORD_CHANGE" ? "rejected" : "unconfirmed"
            )
          return undefined
        }
        // Only a refreshed profile that already cleared the flag proves the step is complete.
        if (result.data.mustChangePassword === false) {
          this.failure.set(null)
          this.changed.emit()
        } else {
          this.failure.set("unconfirmed")
        }
      } catch {
        if (!this.destroyRef.destroyed) this.failure.set("unconfirmed")
      }
      return undefined
    })
  }

  /**
   * GET-only retry for an unconfirmed outcome: it re-reads the profile and never replays the
   * password write, so a change that already reached the backend cannot be sent twice.
   */
  async checkStatus(): Promise<void> {
    if (this.destroyRef.destroyed || this.checking()) return
    this.checking.set(true)
    try {
      const session = await firstValueFrom(
        this.authStore.refreshSession().pipe(takeUntilDestroyed(this.destroyRef)),
        { defaultValue: undefined }
      )
      if (this.destroyRef.destroyed) return
      if (session && session.mustChangePassword === false) {
        this.failure.set(null)
        this.changed.emit()
      } else {
        this.failure.set("unconfirmed")
      }
    } catch {
      if (!this.destroyRef.destroyed) this.failure.set("unconfirmed")
    } finally {
      if (!this.destroyRef.destroyed) this.checking.set(false)
    }
  }
}
