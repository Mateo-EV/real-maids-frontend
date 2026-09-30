import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { inject } from "@angular/core"
import { CanActivateFn, Router } from "@angular/router"

export const authGuard: CanActivateFn = (_route, state) => {
  const authStore = inject(AuthStore)
  const router = inject(Router)

  return authStore.isAuthenticated()
    ? true
    : router.createUrlTree(["/login"], { queryParams: { returnUrl: state.url } })
}

export const guestGuard: CanActivateFn = () => {
  const authStore = inject(AuthStore)
  const router = inject(Router)

  return authStore.isAuthenticated() ? router.createUrlTree(["/admin"]) : true
}
