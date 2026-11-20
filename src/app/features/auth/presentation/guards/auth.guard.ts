import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { inject } from "@angular/core"
import { CanActivateFn, Router } from "@angular/router"
import { map } from "rxjs"
import { PASSWORD_CHANGE_PATH, safeDestination } from "../routing/password-change-navigation"

/**
 * A session whose provisional password is still pending can only reach the change screen. The
 * captured destination travels in `returnUrl` and is what the screen uses after a confirmed change.
 */
const passwordChangeTree = (router: Router, returnUrl: string) =>
  router.createUrlTree([PASSWORD_CHANGE_PATH], { queryParams: { returnUrl } })

export const authGuard: CanActivateFn = (_route, state) => {
  const authStore = inject(AuthStore)
  const router = inject(Router)

  const returnUrl = safeDestination(state.url)

  return authStore.restoreSession().pipe(
    map(session => {
      if (session === null) return router.createUrlTree(["/login"], { queryParams: { returnUrl } })
      return session.mustChangePassword ? passwordChangeTree(router, returnUrl) : true
    })
  )
}

export const guestGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore)
  const router = inject(Router)

  return authStore.restoreSession().pipe(
    map(session => {
      if (session === null) return true
      return session.mustChangePassword
        ? passwordChangeTree(router, "/admin")
        : router.createUrlTree(["/admin"])
    })
  )
}

/**
 * Guards the change screen itself: it needs an authenticated session, keeps a pending session
 * there, and moves an already-settled session to its destination instead of showing a dead form.
 */
export const passwordChangeGuard: CanActivateFn = (route, _state) => {
  const authStore = inject(AuthStore)
  const router = inject(Router)

  const destination = safeDestination(route.queryParamMap.get("returnUrl"))

  return authStore.restoreSession().pipe(
    map(session => {
      if (session === null)
        return router.createUrlTree(["/login"], { queryParams: { returnUrl: destination } })
      return session.mustChangePassword ? true : router.createUrlTree([destination])
    })
  )
}
