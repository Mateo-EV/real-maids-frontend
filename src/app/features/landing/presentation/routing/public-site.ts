/**
 * Model of the public marketing site (S1/S2).
 *
 * The public pages are prerendered as static HTML and rendered outside the private loading
 * boundary that the root component keeps for `/login`, `/change-password`, `/admin`, `/portal`
 * and `/staff`. One list decides both things, so a page can never be prerendered without also
 * being able to render itself in the browser, or the other way around.
 *
 * Paths are stored without a leading slash because that is the shape the server route table
 * takes. The empty entry is the site root.
 */
export const PUBLIC_SITE_PATHS = ["", "quote", "work-with-us", "faq", "reviews"] as const

/** Former public URLs kept as redirects; they lead to public pages, never to a private one. */
const LEGACY_PUBLIC_PREFIX = "landing"

/**
 * Reduces a path or an absolute URL to a comparable pathname.
 *
 * The entry decision has to be identical on the prerendering server (where the URL comes from the
 * request used to render the route) and in the browser (where it comes from the document), so the
 * comparison ignores origin, query string, fragment and trailing slashes.
 */
const toPathname = (pathOrUrl: string): string => {
  const raw = pathOrUrl.trim()
  const candidate = raw === "" ? "/" : raw

  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(candidate) || candidate.startsWith("//")) {
    try {
      return new URL(candidate, "http://localhost").pathname
    } catch {
      return "/"
    }
  }

  const withoutQueryAndHash = candidate.split(/[?#]/, 1)[0] ?? candidate
  return withoutQueryAndHash.startsWith("/") ? withoutQueryAndHash : `/${withoutQueryAndHash}`
}

/** Normalizes a pathname to ``""`` (root) or ``"quote"``/``"landing/quote"``-style segments. */
const toSegment = (pathOrUrl: string): string => {
  const pathname = toPathname(pathOrUrl).replace(/\/+$/, "")
  return pathname === "" ? "" : pathname.slice(1)
}

/** True when the URL belongs to the public marketing site instead of a private experience. */
export function isPublicSitePath(pathOrUrl: string): boolean {
  const segment = toSegment(pathOrUrl)
  const publicPaths: readonly string[] = PUBLIC_SITE_PATHS

  return (
    publicPaths.includes(segment) ||
    segment === LEGACY_PUBLIC_PREFIX ||
    segment.startsWith(`${LEGACY_PUBLIC_PREFIX}/`)
  )
}
