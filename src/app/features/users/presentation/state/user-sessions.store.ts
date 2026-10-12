import { computed, inject } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { catchError, defaultIfEmpty, defer, finalize, map, of, switchMap } from "rxjs"
import { GetAllUserSessionsUseCase } from "../../application/use-cases/get-all-user-sessions.use-case"
import { RevokeUserSessionUseCase } from "../../application/use-cases/revoke-user-session.use-case"
import { RevokeUserSessionsUseCase } from "../../application/use-cases/revoke-user-sessions.use-case"
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
      store.sessions().filter(s => s.expiryDate.getTime() > store.now())
    ),
    sessionCount: computed(() => store.sessions().length)
  })),
  withMethods(
    (
      store,
      all = inject(GetAllUserSessionsUseCase),
      revoke = inject(RevokeUserSessionUseCase),
      bulk = inject(RevokeUserSessionsUseCase)
    ) => {
      let pending = 0,
        latestLoad = 0
      const failure = (e: unknown) =>
        Result.failure(e instanceof UserSessionError ? e : new UserSessionError("UNEXPECTED"))
      function loadSessions() {
        return defer(() => {
          const load = ++latestLoad
          let received = false
          pending++
          patchState(store, { loading: true, loaded: false, error: undefined, now: Date.now() })
          return defer(() => all.execute()).pipe(
            defaultIfEmpty(Result.failure(new UserSessionError("INVALID_RESPONSE"))),
            catchError(e => of(failure(e))),
            map(result => {
              received = true
              if (load !== latestLoad) return result
              if (result.success)
                patchState(store, {
                  sessions: result.data,
                  loaded: true,
                  error: undefined,
                  now: Date.now()
                })
              else patchState(store, { error: result.error })
              return result
            }),
            finalize(() => {
              pending--
              if (!received && load === latestLoad) patchState(store, { loaded: false })
              patchState(store, { loading: pending > 0 })
            })
          )
        })
      }
      function refreshAfterWrite(result: Result<void, UserSessionError>) {
        if (!result.success) return of(result)
        latestLoad++
        // Bulk on the caller retains actual=true. Requery without optimistic patches or replay.
        return loadSessions().pipe(map(() => result))
      }
      return {
        loadSessions,
        loadAllSessions: loadSessions,
        refreshClock() {
          patchState(store, { now: Date.now() })
        },
        revokeSession(userId: number, id: number) {
          return defer(() => {
            if (store.sessions().some(s => s.userId === userId && s.id === id && s.isCurrent))
              return of(Result.failure(new UserSessionError("CURRENT_SESSION")))
            return revoke.execute(userId, id)
          }).pipe(
            catchError(e => of(failure(e))),
            switchMap(refreshAfterWrite)
          )
        },
        revokeSessions(userId: number) {
          return defer(() => bulk.execute(userId)).pipe(
            catchError(e => of(failure(e))),
            switchMap(refreshAfterWrite)
          )
        }
      }
    }
  )
)
