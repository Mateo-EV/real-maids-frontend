import { Component, inject } from "@angular/core"
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideFileText, lucideLogOut, lucideSparkles } from "@ng-icons/lucide"
import { HlmAvatarImports } from "@spartan-ng/helm/avatar"
import { HlmBadgeImports } from "@spartan-ng/helm/badge"
import { HlmButtonImports } from "@spartan-ng/helm/button"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"

interface PortalSection {
  readonly label: string
  readonly path: string
  readonly icon: string
}

/**
 * WP10 T2 / S4 — the customer portal experience shell. It mirrors the admin shell's structure
 * (brand, session identity, logout and a `router-outlet`) without any administrative affordance:
 * no sidebar, no KPIs, no environment/security status and no action the customer cannot perform.
 *
 * The navigation lists only sections that are actually implemented; a later slice adds its own
 * entry when its consumer exists, so the portal never shows a dead destination.
 */
@Component({
  selector: "app-portal-shell",
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgIcon,
    HlmAvatarImports,
    HlmBadgeImports,
    HlmButtonImports
  ],
  providers: [provideIcons({ lucideFileText, lucideLogOut, lucideSparkles })],
  templateUrl: "./portal-shell.html",
  styleUrl: "./portal-shell.css"
})
export class PortalShell {
  private readonly auth = inject(AuthStore)
  private readonly router = inject(Router)
  readonly session = this.auth.session
  readonly sections: readonly PortalSection[] = [
    { label: "Mis solicitudes", path: "/portal/requests", icon: "lucideFileText" }
  ]

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
