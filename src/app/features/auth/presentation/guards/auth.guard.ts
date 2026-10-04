import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { inject } from "@angular/core"
import { CanActivateFn, Router } from "@angular/router"
import { map } from "rxjs"

export const authGuard: CanActivateFn = (_route, state) => {
  const authStore = inject(AuthStore)
  const router = inject(Router)

  const returnUrl = state.url.startsWith("/") && !state.url.startsWith("//") ? state.url : "/admin"

  return authStore
    .restoreSession()
    .pipe(
      map(session =>
        session !== null ? true : router.createUrlTree(["/login"], { queryParams: { returnUrl } })
      )
    )
}

export const guestGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore)
  const router = inject(Router)

  return authStore
    .restoreSession()
    .pipe(map(session => (session !== null ? router.createUrlTree(["/admin"]) : true)))
}
