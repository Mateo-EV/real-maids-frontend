import { RenderMode, ServerRoute } from "@angular/ssr"
import { PUBLIC_SITE_PATHS } from "./features/landing/presentation/routing/public-site"

/**
 * Render modes for the static deployment (`outputMode: "static"`).
 *
 * The public marketing site is prerendered at build time so the host serves real page HTML both to
 * search engines and to a visitor opening a deep link: `/`, `/quote`, `/work-with-us`, `/faq` and
 * `/reviews` emit their own page instead of the client shell. That only works together with the
 * root component, which renders the router outlet on the first pass for those paths
 * (`isPublicSitePath`) instead of its neutral loading view, so a build-time snapshot contains the
 * page instead of a spinner. Both sides read the same list, so a page cannot be prerendered as a
 * splash screen.
 *
 * `/login` keeps its own prerender: it is the one private screen that is safe to snapshot, and its
 * neutral loading view is exactly the markup the root component hydrates there.
 *
 * Every other route is `Client`: the admin, portal and staff experiences need a session and real
 * API reads, and the static host serves the client shell for those deep links.
 */
export const serverRoutes: ServerRoute[] = [
  ...PUBLIC_SITE_PATHS.map<ServerRoute>(path => ({ path, renderMode: RenderMode.Prerender })),
  {
    path: "login",
    renderMode: RenderMode.Prerender
  },
  {
    path: "**",
    renderMode: RenderMode.Client
  }
]
