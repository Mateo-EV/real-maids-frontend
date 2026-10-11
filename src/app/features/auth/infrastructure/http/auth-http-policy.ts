import { HttpContext, HttpContextToken } from "@angular/common/http"
import { environment } from "@/environments/environment"

// Internal credential snapshots bypass renewal and response invalidation.
export const AUTH_INTERNAL = new HttpContextToken(() => false)
export const authContext = () => new HttpContext().set(AUTH_INTERNAL, true)

export function apiOrigin(
  value: unknown,
  production: boolean = environment.production
): string | null {
  if (typeof value !== "string" || !value) return null
  try {
    const url = new URL(value)
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") return null
    if (url.protocol !== "https:" && !(url.origin === "http://localhost:8080" && !production))
      return null
    return url.origin
  } catch {
    return null
  }
}

export function protectedApiUrl(value: string, origin: string | null): boolean {
  if (!origin) return false
  try {
    // Relative URLs resolve against the frontend, not the configured backend.
    const url = new URL(
      value,
      typeof location === "undefined" ? "https://invalid.test" : location.origin
    )
    return (
      !url.username &&
      !url.password &&
      url.origin === origin &&
      url.pathname.startsWith("/api/") &&
      !["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"].includes(url.pathname)
    )
  } catch {
    return false
  }
}
