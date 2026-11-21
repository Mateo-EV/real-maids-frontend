import { LoginUseCase } from "@/app/features/auth/application/use-cases/login.use-case"
import { LogoutUseCase } from "@/app/features/auth/application/use-cases/logout.use-case"
import { Result } from "@/app/shared/utils/result"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { LoginParams } from "@/app/features/auth/domain/params/login.params"
import { ChangePasswordParams } from "@/app/features/auth/domain/params/change-password.params"
import { computed, DestroyRef, inject, Injector } from "@angular/core"
import { AuthError } from "../../domain/errors/auth.error"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { catchError, defaultIfEmpty, defer, map, Observable, of, take, tap } from "rxjs"
import { GetCurrentUserUseCase } from "../../application/use-cases/get-current-user.use-case"
import { ObserveAuthSessionUseCase } from "../../application/use-cases/observe-auth-session.use-case"
import { InvalidateAuthSessionUseCase } from "../../application/use-cases/invalidate-auth-session.use-case"
import { ChangePasswordUseCase } from "../../application/use-cases/change-password.use-case"

interface AuthState {
  readonly session: AuthSession | null
}

const initialState: AuthState = {
  session: null
}

export const AuthStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(({ session }) => ({
    isAuthenticated: computed(() => session() !== null),
    /** A provisional password still has to be replaced before any other authenticated screen. */
    mustChangePassword: computed(() => session()?.mustChangePassword === true)
  })),
  withMethods(
    (
      store,
      loginUseCase = inject(LoginUseCase),
      logoutUseCase = inject(LogoutUseCase),
      getCurrentUserUseCase = inject(GetCurrentUserUseCase),
      observeSessionUseCase = inject(ObserveAuthSessionUseCase),
      invalidateSessionUseCase = inject(InvalidateAuthSessionUseCase)
    ) => {
      // The password-change graph is resolved only when the forced step is used: read consumers and
      // existing auth flows never initialize it.
      const injector = inject(Injector)
      // Login/logout invalidate restoration snapshots without exposing extra store state.
      let sessionRevision = 0
      let expiryTimer: ReturnType<typeof setTimeout> | undefined
      const clear = (remote = false) => {
        sessionRevision++
        clearTimeout(expiryTimer)
        expiryTimer = undefined
        if (remote) logoutUseCase.execute()
        else invalidateSessionUseCase.execute()
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
      const sessionSubscription = observeSessionUseCase.execute().subscribe(session => {
        patchState(store, { session })
        scheduleExpiry()
      })
      inject(DestroyRef).onDestroy(() => {
        clearTimeout(expiryTimer)
        sessionSubscription.unsubscribe()
      })

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
        /**
         * Re-reads the profile without dropping the verified session when the read fails: a
         * transient failure must not log the person out or cancel the pending change step.
         */
        refreshSession(): Observable<AuthSession | null> {
          return defer(() => {
            const revision = sessionRevision
            return defer(() => getCurrentUserUseCase.execute(true)).pipe(
              take(1),
              map(result => (result.success ? result.data : null)),
              defaultIfEmpty(null),
              catchError(() => of(null)),
              map(session => {
                if (revision !== sessionRevision) return store.session()
                if (session !== null) {
                  patchState(store, { session })
                  scheduleExpiry()
                }
                return store.session()
              })
            )
          })
        },
        /**
         * Confirmed own password change. The use case already re-read the profile, so success carries
         * the refreshed session; a rejection keeps the current session and its pending flag.
         */
        changePassword(params: ChangePasswordParams) {
          return defer(() => {
            const revision = sessionRevision
            return injector
              .get(ChangePasswordUseCase)
              .execute(params)
              .pipe(
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
          clear(true)
        }
      }
    }
  )
)
