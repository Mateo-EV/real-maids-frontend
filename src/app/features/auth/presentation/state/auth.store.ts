import { LoginUseCase } from "@/app/features/auth/application/use-cases/login.use-case"
import { LogoutUseCase } from "@/app/features/auth/application/use-cases/logout.use-case"
import { Result } from "@/app/shared/utils/result"
import { UserSession } from "@/app/features/auth/domain/entities/user-session.entity"
import { LoginParams } from "@/app/features/auth/domain/params/login.params"
import { computed, inject } from "@angular/core"
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

      return {
        restoreSession() {
          return defer(() => {
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
                return session
              })
            )
          })
        },
        login(params: LoginParams) {
          return loginUseCase.execute(params).pipe(
            tap(result => {
              if (result.success) {
                sessionRevision++
                patchState(store, { session: result.data })
              }
            })
          )
        },
        logout(): void {
          sessionRevision++
          logoutUseCase.execute()
          patchState(store, initialState)
        }
      }
    }
  )
)
