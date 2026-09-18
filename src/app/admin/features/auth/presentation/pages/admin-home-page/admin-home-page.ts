import { AuthService } from "@/app/admin/features/auth/application/services/auth.service"
import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { Router } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideLogOut, lucideShieldCheck, lucideSparkles } from "@ng-icons/lucide"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmCardImports } from "@spartan-ng/helm/card"

@Component({
  imports: [NgIcon, ...HlmButtonImports, ...HlmCardImports],
  selector: "app-admin-home-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideLogOut, lucideShieldCheck, lucideSparkles })],
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
    }
  `,
  templateUrl: "./admin-home-page.html"
})
export class AdminHomePage {
  private readonly authService = inject(AuthService)
  private readonly router = inject(Router)

  readonly session = this.authService.session

  logout(): void {
    this.authService.logout()
    void this.router.navigateByUrl("/login")
  }
}
