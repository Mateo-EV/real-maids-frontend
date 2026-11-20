import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ChangeDetectionStrategy, Component, computed, inject } from "@angular/core"
import { ActivatedRoute, Router } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideLogOut, lucideShieldCheck } from "@ng-icons/lucide"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { ChangePasswordFormComponent } from "../../components/change-password-form/change-password-form"
import { safeDestination } from "../../routing/password-change-navigation"

@Component({
  imports: [ChangePasswordFormComponent, NgIcon, ...HlmButtonImports],
  selector: "app-change-password-page",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [provideIcons({ lucideLogOut, lucideShieldCheck })],
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
    }
  `,
  templateUrl: "./change-password-page.html"
})
export class ChangePasswordPage {
  private readonly authStore = inject(AuthStore)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)

  readonly email = computed(() => this.authStore.session()?.email ?? null)

  onChanged(): Promise<boolean> {
    return this.router.navigateByUrl(
      safeDestination(this.route.snapshot.queryParamMap.get("returnUrl"))
    )
  }

  /** Escape hatch: the forced step never traps the person inside the session. */
  signOut(): void {
    this.authStore.logout()
    void this.router.navigateByUrl("/login")
  }
}
