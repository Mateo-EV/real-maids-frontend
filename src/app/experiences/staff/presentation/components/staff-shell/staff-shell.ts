import { Component, inject } from "@angular/core"
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router"
import { NgIcon, provideIcons } from "@ng-icons/core"
import { lucideCalendarDays, lucideLogOut, lucideSparkles } from "@ng-icons/lucide"
import { HlmAvatar, HlmAvatarFallback } from "@spartan-ng/helm/avatar"
import { HlmBadge } from "@spartan-ng/helm/badge"
import { HlmButton } from "@spartan-ng/helm/button"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"

interface StaffSection {
  readonly label: string
  readonly path: string
  readonly icon: string
}

/**
 * WP11 T2 / S3 — the field staff experience shell.
 *
 * It carries exactly what a field staff session needs — brand, own session identity, logout and a
 * `router-outlet` — and nothing administrative: no sidebar, no KPIs, no environment status and no
 * destination the role cannot open. The navigation lists only implemented sections, so it grows with
 * its consumers instead of announcing dead pages.
 *
 * Helm dependencies are declared by name, never as a spread of an imported `*Imports` constant: the
 * dev server re-applies this metadata through `ɵɵnamespaces` and resolves those entries by index.
 */
@Component({
  selector: "app-staff-shell",
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
  providers: [provideIcons({ lucideCalendarDays, lucideLogOut, lucideSparkles })],
  templateUrl: "./staff-shell.html",
  styleUrl: "./staff-shell.css"
})
export class StaffShell {
  private readonly auth = inject(AuthStore)
  private readonly router = inject(Router)
  readonly session = this.auth.session
  readonly sections: readonly StaffSection[] = [
    { label: "Mis servicios", path: "/staff/services", icon: "lucideSparkles" },
    // S2: the employee's own absence requests; only listed because its consumer exists.
    { label: "Mis ausencias", path: "/staff/absences", icon: "lucideCalendarDays" }
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
