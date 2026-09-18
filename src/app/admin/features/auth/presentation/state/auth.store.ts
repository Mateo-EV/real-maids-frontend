import { AuthService } from "@/app/admin/features/auth/application/services/auth.service"
import { UserSession } from "@/app/admin/features/auth/domain/entities/user-session.entity"
import { LoginParams } from "@/app/admin/features/auth/domain/params/login.params"
import { computed, inject } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { tap } from "rxjs"

interface AuthState {
  readonly session: UserSession | null
}

const initialState: AuthState = {
  session: null
}

export const AuthStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(({ session }) => ({
    isAuthenticated: computed(() => session() !== null)
  })),
  withMethods((store, authService = inject(AuthService)) => ({
    login(params: LoginParams) {
      return authService.login(params).pipe(
        tap(result => {
          if (result.success) {
            patchState(store, { session: result.data })
          }
        })
      )
    },
    logout(): void {
      authService.logout()
      patchState(store, initialState)
    }
  }))
)
