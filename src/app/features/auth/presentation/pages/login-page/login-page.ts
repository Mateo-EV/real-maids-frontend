import { LoginFormComponent } from "@/app/features/auth/presentation/components/login-form/login-form"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { ActivatedRoute, Router } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideCheck, lucideSparkles } from "@ng-icons/lucide"
import { PASSWORD_CHANGE_PATH, safeDestination } from "../../routing/password-change-navigation"

@Component({
  imports: [LoginFormComponent, NgIcon],
  selector: "app-login-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideCheck, lucideSparkles })],
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
    }
  `,
  templateUrl: "./login-page.html"
})
export class LoginPage {
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly authStore = inject(AuthStore)

  onAuthenticated(): Promise<boolean> {
    const destination = safeDestination(this.route.snapshot.queryParamMap.get("returnUrl"))
    // A provisional password is a required step, not a suggestion: the destination is only kept as
    // the return URL of the change screen.
    return this.authStore.mustChangePassword()
      ? this.router.navigate([PASSWORD_CHANGE_PATH], { queryParams: { returnUrl: destination } })
      : this.router.navigateByUrl(destination)
  }
}
