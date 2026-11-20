/**
 * Routing decisions for the forced first-sign-in password change (WP10 T16 / S10).
 *
 * The screen is a real route, not a modal: the guard sends an authenticated session whose
 * provisional password is still pending here, and the same `returnUrl` it captured is what the
 * screen uses once the change is confirmed.
 */
export const PASSWORD_CHANGE_PATH = "/change-password"

/**
 * Only an internal, non-credential-bearing destination is accepted. The change screen and login are
 * excluded so a captured URL cannot send the person back into the same step or into a loop.
 */
export function safeDestination(value: string | null | undefined): string {
  if (typeof value !== "string") return "/admin"
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/admin"
  const path = value.split("?")[0]
  if (path === PASSWORD_CHANGE_PATH || path === "/login") return "/admin"
  return value
}
