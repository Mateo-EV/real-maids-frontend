import { Component, inject } from "@angular/core"
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideFileText, lucideLifeBuoy, lucideLogOut, lucideSparkles } from "@ng-icons/lucide"
import { HlmAvatar, HlmAvatarFallback } from "@spartan-ng/helm/avatar"
import { HlmBadge } from "@spartan-ng/helm/badge"
import { HlmButton } from "@spartan-ng/helm/button"
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
 *
 * Helm dependencies are declared by name, never as a spread of an imported `*Imports` constant: the
 * dev server re-applies this metadata through `ɵɵnamespaces` and resolves those entries by index, so
 * the shell shares the same defect and the same fix as every portal page it wraps.
 */ @Component({
  selector: "app-portal-shell",
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    NgIcon,
    HlmAvatar,
    HlmAvatarFallback,
    HlmBadge,
    HlmButton
  ],
  providers: [provideIcons({ lucideFileText, lucideLifeBuoy, lucideLogOut, lucideSparkles })],
  templateUrl: "./portal-shell.html",
  styleUrl: "./portal-shell.css"
})
export class PortalShell {
  private readonly auth = inject(AuthStore)
  private readonly router = inject(Router)
  readonly session = this.auth.session
  readonly sections: readonly PortalSection[] = [
    { label: "Mis solicitudes", path: "/portal/requests", icon: "lucideFileText" },
    { label: "Mis servicios", path: "/portal/services", icon: "lucideSparkles" },
    { label: "Soporte", path: "/portal/support", icon: "lucideLifeBuoy" }
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
