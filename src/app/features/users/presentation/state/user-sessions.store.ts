import { computed, inject } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, finalize, of, tap } from "rxjs"
import { GetUserSessionsUseCase } from "../../application/use-cases/get-user-sessions.use-case"
import { RevokeUserSessionUseCase } from "../../application/use-cases/revoke-user-session.use-case"
import { UserSession } from "../../domain/entities/user-session.entity"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { Result } from "@/app/shared/utils/result"

export const UserSessionsStore = signalStore(
  { providedIn: "root" },
  withState({
    sessions: [] as UserSession[],
    now: Date.now(),
    loading: false,
    loaded: false,
    error: undefined as UserSessionError | undefined
  }),
  withComputed(store => ({
    activeSessions: computed(() =>
      store.sessions().filter(session => session.expiryDate.getTime() > store.now())
    )
  })),
  withMethods(
    (store, query = inject(GetUserSessionsUseCase), revoke = inject(RevokeUserSessionUseCase)) => {
      let pending = 0
      let revision = 0
      let latestLoad = 0
      const failure = (error: unknown) =>
        Result.failure(
          error instanceof UserSessionError ? error : new UserSessionError("UNEXPECTED")
        )
      return {
        refreshClock() {
          patchState(store, { now: Date.now() })
        },
        loadSessions() {
          return defer(() => {
            const load = ++latestLoad,
              snapshot = revision
            pending++
            patchState(store, { loading: true, error: undefined, now: Date.now() })
            return defer(() => query.execute()).pipe(
              catchError(error => of(failure(error))),
              tap(result => {
                if (load !== latestLoad || snapshot !== revision) return
                if (result.success)
                  patchState(store, {
                    sessions: result.data,
                    loaded: true,
                    now: Date.now(),
                    error: undefined
                  })
                else patchState(store, { error: result.error })
              }),
              finalize(() => {
                pending--
                patchState(store, { loading: pending > 0 })
              })
            )
          })
        },
        revokeSession(userId: number, id: number) {
          return defer(() => revoke.execute(userId, id)).pipe(
            catchError(error => of(failure(error))),
            tap(result => {
              if (!result.success) return
              revision++
              patchState(store, state => ({
                sessions: state.sessions.filter(session => session.id !== id),
                now: Date.now()
              }))
            })
          )
        }
      }
    }
  )
)
