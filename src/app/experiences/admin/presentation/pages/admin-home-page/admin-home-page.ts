import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ChangeDetectionStrategy, Component, inject } from "@angular/core"
import { Router, RouterLink } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideLogOut, lucideShieldCheck, lucideSparkles } from "@ng-icons/lucide"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmCardImports } from "@spartan-ng/helm/card"

@Component({
  imports: [RouterLink, NgIcon, ...HlmButtonImports, ...HlmCardImports],
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
  private readonly authStore = inject(AuthStore)
  private readonly router = inject(Router)

  readonly session = this.authStore.session

  logout(): void {
    this.authStore.logout()
    void this.router.navigateByUrl("/login")
  }
}
