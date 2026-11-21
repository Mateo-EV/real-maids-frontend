import { CUSTOMER_ROLE_NAME } from "@/app/features/users/domain/params/create-user.params"
import { safeDestination } from "./password-change-navigation"

/**
 * WP10 T2 / S4 + WP11 T2 / S3 — the authenticated experiences and the audience that owns each one.
 *
 * The customer portal lives at `/portal`, the staff backoffice at `/admin` and the field staff
 * experience at `/staff`. Which one a session belongs to comes from the role label the backend
 * returned in its profile (`AuthSession.role`), never from permissions, role IDs or an inferred user
 * type. The customer role is the backend's own `CLIENTE` name (`CuentaClienteService.ROL_CLIENTE`),
 * the same identity the users form uses to announce that a customer row will be created; the field
 * staff role is the `PERSONAL_CAMPO` label `PerfilResponse.rol` returns for the seeded role that
 * carries `PERSONAL_LEER_PROPIO`, `ORDEN_LEER_ASIGNADA` and `ORDEN_ESTADO_ASIGNADA`. Both are
 * identity, never an ACL: nothing here grants a permission.
 */
export const ADMIN_HOME = "/admin"
export const PORTAL_HOME = "/portal"
export const STAFF_HOME = "/staff"

/** The backend's role label for the field staff audience (`PerfilResponse.rol`), not a permission. */
export const FIELD_STAFF_ROLE_NAME = "PERSONAL_CAMPO"

export type ExperienceAudience = "admin" | "portal" | "staff"

/** Identity, not ACL: `CLIENTE` is the backend's role name; padding is not another role. */
export function isCustomerRole(role: string | null | undefined): boolean {
  return typeof role === "string" && role.trim() === CUSTOMER_ROLE_NAME
}

/** Identity, not ACL: `PERSONAL_CAMPO` is the backend's role name for the field staff audience. */
export function isFieldStaffRole(role: string | null | undefined): boolean {
  return typeof role === "string" && role.trim() === FIELD_STAFF_ROLE_NAME
}

/**
 * The experience a session owns: customers get the portal, field staff their own experience and
 * everybody else the backoffice.
 */
export function homeForRole(role: string | null | undefined): string {
  if (isCustomerRole(role)) return PORTAL_HOME
  if (isFieldStaffRole(role)) return STAFF_HOME
  return ADMIN_HOME
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
  if (path === STAFF_HOME || path.startsWith(`${STAFF_HOME}/`)) return "staff"
  if (path === ADMIN_HOME || path.startsWith(`${ADMIN_HOME}/`)) return "admin"
  return null
}

/**
 * Where a session must go instead of this URL, or `null` when it may stay. The target is always the
 * home that `homeForRole` derives from the very same label, so re-evaluating this decision on the
 * destination allows it and the three experiences cannot bounce a session back and forth.
 */
export function audienceRedirect(url: string, role: string | null | undefined): string | null {
  const audience = audienceOf(url)
  if (audience === null) return null
  const home = homeForRole(role)
  if (audience === "portal") return home === PORTAL_HOME ? null : home
  if (audience === "staff") return home === STAFF_HOME ? null : home
  return home === ADMIN_HOME ? null : home
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
