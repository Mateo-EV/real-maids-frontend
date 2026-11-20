import type { CanDeactivateFn } from "@angular/router"

/** The seam a pending page exposes to the router: only a settled write may be left behind. */
export interface PortalPendingLeave {
  canLeave(): boolean
  /** Reports the refusal, so the pending state is never a silent trap. */
  blockLeave(): void
}

/**
 * WP10 T6 / S7 — leaving the own-attention form while its POST is in flight would abandon a
 * request whose outcome nobody is left to report, so the navigation is refused and the page
 * keeps its draft. The consumer decides what "in flight" means; a confirmed creation always
 * allows the navigation it triggers itself.
 */
export const portalPendingLeaveGuard: CanDeactivateFn<PortalPendingLeave> = component => {
  if (!component || component.canLeave()) return true
  component.blockLeave()
  return false
}
