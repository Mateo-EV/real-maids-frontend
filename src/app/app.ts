import { isPlatformBrowser } from "@angular/common"
import { afterNextRender, Component, inject, PLATFORM_ID, signal } from "@angular/core"
import { takeUntilDestroyed } from "@angular/core/rxjs-interop"
import {
  NavigationCancel,
  NavigationCancellationCode,
  NavigationEnd,
  NavigationError,
  NavigationSkipped,
  NavigationStart,
  Router,
  RouterOutlet
} from "@angular/router"
import { HlmAlertImports } from "@spartan-ng/helm/alert"
import { HlmButton } from "@spartan-ng/helm/button"
import { HlmSpinner } from "@spartan-ng/helm/spinner"

@Component({
  imports: [RouterOutlet, HlmSpinner, HlmButton, HlmAlertImports],
  selector: "app-root",
  template: `
    @if (revealed()) {
      <router-outlet />
    } @else {
      <main class="bg-background text-foreground grid min-h-dvh place-items-center p-6">
        @if (failed()) {
          <section hlmAlert class="max-w-sm">
            <h1 hlmAlertTitle>No se pudo abrir la página</h1>
            <p hlmAlertDescription>Reintenta para continuar.</p>
            <button hlmBtn class="mt-4" type="button" (click)="retry()">Reintentar</button>
          </section>
        } @else {
          <div class="flex w-full max-w-sm flex-col items-center gap-10 text-center">
            <div class="flex flex-col items-center gap-4">
              <span
                aria-hidden="true"
                class="bg-primary text-primary-foreground border-accent flex size-16 items-center justify-center rounded-2xl border-b-2 text-xl font-bold tracking-tight"
              >
                RM
              </span>
              <div class="flex flex-col gap-1">
                <p class="text-primary text-xl font-bold tracking-tight">The Real Maids</p>
                <p class="text-muted-foreground text-xs">Operaciones y servicios</p>
              </div>
            </div>
            <div class="flex flex-col items-center gap-4">
              <h1 class="text-2xl font-semibold tracking-tight">Preparando tu espacio</h1>
              <div
                role="status"
                aria-live="polite"
                class="text-muted-foreground flex items-center gap-2 text-sm"
              >
                <hlm-spinner aria-hidden="true" />
                <span>Cargando…</span>
              </div>
            </div>
          </div>
        }
      </main>
    }
  `
})
export class App {
  private readonly router = inject(Router)
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  protected readonly revealed = signal(false)
  protected readonly failed = signal(false)
  private rendered = false
  private outcome: "pending" | "success" | "failure" = "pending"
  private target = "/"

  constructor() {
    // Navigation can finish before hydration's first render. Record it without changing
    // the initial template; server and browser must both start with the neutral view.
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (this.revealed()) return
      if (event instanceof NavigationStart) {
        this.target = event.url
        this.outcome = "pending"
      } else if (event instanceof NavigationEnd) {
        this.outcome = "success"
      } else if (
        event instanceof NavigationError ||
        event instanceof NavigationSkipped ||
        (event instanceof NavigationCancel &&
          event.code !== NavigationCancellationCode.Redirect &&
          event.code !== NavigationCancellationCode.SupersededByNewNavigation)
      ) {
        this.outcome = "failure"
      }
      this.presentOutcome()
    })
    afterNextRender(() => {
      this.rendered = true
      this.presentOutcome()
    })
  }

  private presentOutcome(): void {
    if (!this.browser || !this.rendered || this.revealed()) return
    this.failed.set(this.outcome === "failure")
    // The router retains activated route contexts even without an outlet. Creating
    // the outlet now mounts only the final selected route, never an interim login.
    if (this.outcome === "success") this.revealed.set(true)
  }

  protected retry(): void {
    void this.router.navigateByUrl(this.target, { onSameUrlNavigation: "reload" }).catch(() => {
      // NavigationError already supplies the accessible failure state.
    })
  }
}
