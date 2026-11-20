import { LoginFormComponent } from "@/app/features/auth/presentation/components/login-form/login-form"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { ActivatedRoute, Router } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideCheck, lucideSparkles } from "@ng-icons/lucide"
import { destinationForRole } from "../../routing/audience-navigation"
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
    if (this.authStore.mustChangePassword())
      return this.router.navigate([PASSWORD_CHANGE_PATH], {
        queryParams: { returnUrl: destination }
      })
    // WP10 T2/S4: the captured destination is only kept when this role may open it; a customer
    // always lands in the portal and staff in the backoffice, without a bounce off a guard.
    return this.router.navigateByUrl(
      destinationForRole(destination, this.authStore.session()?.role)
    )
  }
}
