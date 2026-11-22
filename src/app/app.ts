import { isPlatformBrowser, PlatformLocation } from "@angular/common"
import {
  afterNextRender,
  Component,
  inject,
  InjectionToken,
  PLATFORM_ID,
  REQUEST,
  signal
} from "@angular/core"
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
import { isPublicSitePath } from "./features/landing/presentation/routing/public-site"

/**
 * Path of the document that bootstrapped the app.
 *
 * The root template has to decide between the prerendered public page and the private loading
 * boundary on its very first render, before the router reports its initial navigation. This token
 * answers that question identically on the server (prerendering renders each route from its own
 * request) and in the browser (the document URL), so both sides emit the same DOM and hydration
 * can reuse it. Tests and other platforms can override it.
 *
 * `null` means "this platform cannot name the document". The root component then stays behind the
 * private boundary, which is the behaviour every private entry already has.
 */
export const ENTRY_PATH = new InjectionToken<string | null>("ENTRY_PATH", {
  providedIn: "root",
  factory: () => {
    const requestUrl = inject(REQUEST, { optional: true })?.url
    if (requestUrl) {
      try {
        return new URL(requestUrl).pathname
      } catch {
        // A malformed request URL cannot identify a page; fall back to the platform location.
      }
    }

    return inject(PlatformLocation, { optional: true })?.pathname ?? null
  }
})

@Component({
  imports: [RouterOutlet, HlmSpinner, HlmButton, HlmAlertImports],
  selector: "app-root",
  template: `
    @if (failed()) {
      <main class="bg-background text-foreground grid min-h-dvh place-items-center p-6">
        <section hlmAlert class="max-w-sm">
          <h1 hlmAlertTitle>No se pudo abrir la página</h1>
          <p hlmAlertDescription>Reintenta para continuar.</p>
          <button hlmBtn class="mt-4" type="button" (click)="retry()">Reintentar</button>
        </section>
      </main>
    } @else if (revealed() || publicEntry) {
      <router-outlet />
    } @else {
      <main class="bg-background text-foreground grid min-h-dvh place-items-center p-6">
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
      </main>
    }
  `
})
export class App {
  private readonly router = inject(Router)
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID))
  /**
   * S2: the loading boundary belongs to the private experiences and `/login`, never to the public
   * pages. A prerendered public page already carries its own HTML, so the outlet renders on the
   * first pass — the same markup the prerenderer emitted — and no gate can hide it. An unknown
   * document path keeps the private boundary instead of being treated as the site root.
   */
  protected readonly publicEntry = this.isPublicEntry()
  protected readonly revealed = signal(false)
  protected readonly failed = signal(false)
  private rendered = false
  private outcome: "pending" | "success" | "failure" = "pending"
  private target = "/"

  private isPublicEntry(): boolean {
    const entryPath = inject(ENTRY_PATH)
    return entryPath !== null && isPublicSitePath(entryPath)
  }

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
