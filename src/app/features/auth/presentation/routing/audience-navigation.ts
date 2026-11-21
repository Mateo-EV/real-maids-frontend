import { CUSTOMER_ROLE_NAME } from "@/app/features/users/domain/params/create-user.params"
import { safeDestination } from "./password-change-navigation"

/**
 * WP10 T2 / S4 — the two authenticated experiences and the audience that owns each one.
 *
 * The customer portal lives at `/portal` and the staff backoffice at `/admin`. Which one a session
 * belongs to comes from the role label the backend returned in its profile (`AuthSession.role`),
 * never from permissions, role IDs or an inferred user type. The only customer role is the backend's
 * own `CLIENTE` name (`CuentaClienteService.ROL_CLIENTE`), the same identity the users form uses to
 * announce that a customer row will be created.
 */
export const ADMIN_HOME = "/admin"
export const PORTAL_HOME = "/portal"

export type ExperienceAudience = "admin" | "portal"

/** Identity, not ACL: `CLIENTE` is the backend's role name; padding is not another role. */
export function isCustomerRole(role: string | null | undefined): boolean {
  return typeof role === "string" && role.trim() === CUSTOMER_ROLE_NAME
}

/** The experience a session owns: customers get the portal, everybody else the backoffice. */
export function homeForRole(role: string | null | undefined): string {
  return isCustomerRole(role) ? PORTAL_HOME : ADMIN_HOME
}

/**
 * The experience that owns a URL, or `null` when the URL is audience-neutral (`/login`,
 * `/change-password`, the wildcard destination or nothing at all).
 */
export function audienceOf(url: string | null | undefined): ExperienceAudience | null {
  if (typeof url !== "string") return null
  const [raw = ""] = url.split(/[?#]/)
  const path = `/${raw.replace(/^\/+/, "")}`
  if (path === PORTAL_HOME || path.startsWith(`${PORTAL_HOME}/`)) return "portal"
  if (path === ADMIN_HOME || path.startsWith(`${ADMIN_HOME}/`)) return "admin"
  return null
}

/**
 * Where a session must go instead of this URL, or `null` when it may stay. The target is always the
 * home of the *other* audience, so re-evaluating the same decision on the destination allows it and
 * the two guards cannot bounce a session back and forth.
 */
export function audienceRedirect(url: string, role: string | null | undefined): string | null {
  const audience = audienceOf(url)
  const customer = isCustomerRole(role)
  if (audience === "portal" && !customer) return ADMIN_HOME
  if (audience === "admin" && customer) return PORTAL_HOME
  return null
}

/**
 * The honest post-login destination: the captured URL when this role may open it, otherwise its own
 * experience. The unsafe/destination contract of the forced password change decides first.
 */
export function destinationForRole(
  value: string | null | undefined,
  role: string | null | undefined,
  fallback: string = ADMIN_HOME
): string {
  const destination = safeDestination(value, fallback)
  return audienceRedirect(destination, role) ?? destination
}
