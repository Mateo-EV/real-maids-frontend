import { RenderMode, ServerRoute } from "@angular/ssr"

/**
 * Render modes for the static deployment (`outputMode: "static"`).
 *
 * Prerendering a route here only emits the `app-root` shell: the root component deliberately keeps
 * its neutral loading view until a browser navigation and the first render both complete (see
 * `app.ts`), so a build-time snapshot never contains the page content. That is why the public
 * landing stays `Client` — prerendering it would ship marketing URLs whose HTML is a spinner, which
 * is worse for crawlers than the client shell. `/login` keeps its existing prerender for the same
 * historical reason; it is not a content guarantee.
 *
 * Every other route is `Client`: the admin, portal and staff experiences need a session and real
 * API reads, and the static host serves the client shell for deep links.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: "login",
    renderMode: RenderMode.Prerender
  },
  {
    path: "**",
    renderMode: RenderMode.Client
  }
]
