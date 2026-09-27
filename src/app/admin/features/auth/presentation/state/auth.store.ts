import { LoginUseCase } from "@/app/admin/features/auth/application/use-cases/login.use-case"
import { LogoutUseCase } from "@/app/admin/features/auth/application/use-cases/logout.use-case"
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
  withMethods(
    (store, loginUseCase = inject(LoginUseCase), logoutUseCase = inject(LogoutUseCase)) => ({
      login(params: LoginParams) {
        return loginUseCase.execute(params).pipe(
          tap(result => {
            if (result.success) {
              patchState(store, { session: result.data })
            }
          })
        )
      },
      logout(): void {
        logoutUseCase.execute()
        patchState(store, initialState)
      }
    })
  )
)
