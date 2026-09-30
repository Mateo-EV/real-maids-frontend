import { LoginFormComponent } from "@/app/features/auth/presentation/components/login-form/login-form"
import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { ActivatedRoute, Router } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideCheck, lucideSparkles } from "@ng-icons/lucide"

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

  onAuthenticated(): Promise<boolean> {
    return this.router.navigateByUrl(this.safeReturnUrl())
  }

  private safeReturnUrl(): string {
    const returnUrl = this.route.snapshot.queryParamMap.get("returnUrl")
    return returnUrl?.startsWith("/") && !returnUrl.startsWith("//") ? returnUrl : "/admin"
  }
}
