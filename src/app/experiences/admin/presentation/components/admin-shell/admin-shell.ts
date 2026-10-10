import { Component, inject, signal } from "@angular/core"
import { Router, RouterOutlet } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideLogOut, lucideShieldCheck } from "@ng-icons/lucide"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmAvatarImports } from "@spartan-ng/helm/avatar"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmSelectImports } from "@spartan-ng/helm/select"
import { HlmSidebarImports, HlmSidebarService } from "@spartan-ng/helm/sidebar"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { Lang } from "@/app/features/users/domain/entities/user.entity"
import { environment } from "@/environments/environment"
import { AdminSidebar } from "../admin-sidebar/admin-sidebar"

@Component({
  selector: "app-admin-shell",
  imports: [
    RouterOutlet,
    AdminSidebar,
    NgIcon,
    HlmButtonImports,
    HlmAlertImports,
    HlmAvatarImports,
    HlmBadgeImports,
    HlmSelectImports,
    HlmSidebarImports
  ],
  providers: [HlmSidebarService, provideIcons({ lucideLogOut, lucideShieldCheck })],
  templateUrl: "./admin-shell.html",
  styleUrl: "./admin-shell.css"
})
export class AdminShell {
  private readonly auth = inject(AuthStore)
  private readonly router = inject(Router)
  readonly sidebar = inject(HlmSidebarService)
  readonly session = this.auth.session
  readonly environmentLabel = environment.label
  readonly Lang = Lang
  // Visual preference only: translation and persistence remain outside this shell.
  readonly language = signal<Lang>(Lang.ES)
  readonly languageLabel = (value: unknown): string => (value === Lang.EN ? "Inglés" : "Español")

  setLanguage(value: unknown): void {
    if (value === Lang.ES || value === Lang.EN) this.language.set(value)
  }

  sessionInitials(): string {
    return (this.session()?.name ?? this.session()?.email?.[0] ?? "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0])
      .join("")
      .toUpperCase()
  }

  logout(): void {
    this.auth.logout()
    void this.router.navigateByUrl("/login")
  }
}
