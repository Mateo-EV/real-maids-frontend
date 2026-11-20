import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { inject } from "@angular/core"
import { CanActivateFn, Router } from "@angular/router"
import { map } from "rxjs"
import {
  ADMIN_HOME,
  audienceRedirect,
  destinationForRole,
  homeForRole
} from "../routing/audience-navigation"
import { PASSWORD_CHANGE_PATH, safeDestination } from "../routing/password-change-navigation"

/**
 * A session whose provisional password is still pending can only reach the change screen. The
 * captured destination travels in `returnUrl` and is what the screen uses after a confirmed change.
 */
const passwordChangeTree = (router: Router, returnUrl: string) =>
  router.createUrlTree([PASSWORD_CHANGE_PATH], { queryParams: { returnUrl } })

/**
 * One decision for both protected experiences (WP10 T2 / S4). Authentication comes first, then the
 * forced password change (WP10 T16) and only then the audience rule, so a provisional session is
 * never bounced between experiences before it replaces its password.
 *
 * The rule is symmetric — a customer belongs to `/portal` and every other role to `/admin` — so the
 * same guard protects both trees and a wrong-audience redirect always lands on the home of the
 * audience that owns the session, which that audience's guard allows.
 */
const protectedExperience: CanActivateFn = (_route, state) => {
  const authStore = inject(AuthStore)
  const router = inject(Router)

  const returnUrl = safeDestination(state.url)

  return authStore.restoreSession().pipe(
    map(session => {
      if (session === null) return router.createUrlTree(["/login"], { queryParams: { returnUrl } })
      if (session.mustChangePassword) return passwordChangeTree(router, returnUrl)
      const redirect = audienceRedirect(state.url, session.role)
      return redirect === null ? true : router.createUrlTree([redirect])
    })
  )
}

/** Protects the staff backoffice (`/admin`). */
export const authGuard: CanActivateFn = protectedExperience

/** Protects the customer portal (`/portal`) with the same decision. */
export const portalGuard: CanActivateFn = protectedExperience

export const guestGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore)
  const router = inject(Router)

  return authStore.restoreSession().pipe(
    map(session => {
      if (session === null) return true
      return session.mustChangePassword
        ? passwordChangeTree(router, ADMIN_HOME)
        : router.createUrlTree([homeForRole(session.role)])
    })
  )
}

/**
 * Guards the change screen itself: it needs an authenticated session, keeps a pending session
 * there, and moves an already-settled session to its destination instead of showing a dead form.
 * That destination is audience-aware, so a customer never lands in the backoffice (nor the reverse).
 */
export const passwordChangeGuard: CanActivateFn = (route, _state) => {
  const authStore = inject(AuthStore)
  const router = inject(Router)

  const destination = safeDestination(route.queryParamMap.get("returnUrl"))

  return authStore.restoreSession().pipe(
    map(session => {
      if (session === null)
        return router.createUrlTree(["/login"], { queryParams: { returnUrl: destination } })
      return session.mustChangePassword
        ? true
        : router.createUrlTree([destinationForRole(destination, session.role)])
    })
  )
}
