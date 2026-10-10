import { LoginUseCase } from "@/app/features/auth/application/use-cases/login.use-case"
import { LogoutUseCase } from "@/app/features/auth/application/use-cases/logout.use-case"
import { Result } from "@/app/shared/utils/result"
import { UserSession } from "@/app/features/auth/domain/entities/user-session.entity"
import { LoginParams } from "@/app/features/auth/domain/params/login.params"
import { computed, DestroyRef, inject } from "@angular/core"
import { AuthError } from "../../domain/errors/auth.error"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { catchError, defaultIfEmpty, defer, map, of, take, tap } from "rxjs"
import { GetCurrentUserUseCase } from "../../application/use-cases/get-current-user.use-case"

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
  withMethods(
    (
      store,
      loginUseCase = inject(LoginUseCase),
      logoutUseCase = inject(LogoutUseCase),
      getCurrentUserUseCase = inject(GetCurrentUserUseCase)
    ) => {
      // Login/logout invalidate restoration snapshots without exposing extra store state.
      let sessionRevision = 0
      let expiryTimer: ReturnType<typeof setTimeout> | undefined
      const clear = () => {
        sessionRevision++
        clearTimeout(expiryTimer)
        expiryTimer = undefined
        logoutUseCase.execute()
        patchState(store, initialState)
      }
      const scheduleExpiry = () => {
        clearTimeout(expiryTimer)
        const expiry = store.session()?.expiresAt
        if (expiry == null) return
        if (expiry <= Date.now()) {
          clear()
          return
        }
        expiryTimer = setTimeout(scheduleExpiry, Math.min(expiry - Date.now(), 2147483647))
      }
      inject(DestroyRef).onDestroy(() => clearTimeout(expiryTimer))

      return {
        restoreSession() {
          return defer(() => {
            const loaded = store.session()
            if (loaded?.expiresAt != null && loaded.expiresAt <= Date.now()) clear()
            const revision = sessionRevision
            return defer(() => {
              const session = store.session()
              return session ? of(Result.success(session)) : getCurrentUserUseCase.execute()
            }).pipe(
              take(1),
              map(result => (result.success ? result.data : null)),
              defaultIfEmpty(null),
              catchError(() => of(null)),
              map(session => {
                if (revision !== sessionRevision) return store.session()
                patchState(store, { session })
                scheduleExpiry()
                return store.session()
              })
            )
          })
        },
        login(params: LoginParams) {
          return defer(() => {
            const revision = ++sessionRevision
            clearTimeout(expiryTimer)
            patchState(store, initialState)
            return loginUseCase.execute(params).pipe(
              map(result =>
                revision === sessionRevision ? result : Result.failure(new AuthError("CANCELLED"))
              ),
              tap(result => {
                if (result.success) {
                  patchState(store, { session: result.data })
                  scheduleExpiry()
                }
              })
            )
          })
        },
        logout(): void {
          clear()
        }
      }
    }
  )
)
