import { computed, inject } from "@angular/core"
import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, finalize, map, Observable, of, switchMap } from "rxjs"
import { GetUserSessionsUseCase } from "../../application/use-cases/get-user-sessions.use-case"
import { RevokeUserSessionUseCase } from "../../application/use-cases/revoke-user-session.use-case"
import { RevokeUserSessionsUseCase } from "../../application/use-cases/revoke-user-sessions.use-case"
import { UserSession } from "../../domain/entities/user-session.entity"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { UserSessionPage } from "../../domain/models/user-session-page"
import { UserSessionQuery } from "../../domain/models/user-session-query"
import { Result } from "@/app/shared/utils/result"

export const UserSessionsStore = signalStore(
  { providedIn: "root" },
  withState({
    sessions: [] as UserSession[],
    now: Date.now(),
    loading: false,
    loaded: false,
    page: 0,
    size: 20,
    total: 0,
    totalPages: 0,
    query: {} as UserSessionQuery,
    error: undefined as UserSessionError | undefined
  }),
  withComputed(store => ({
    activeSessions: computed(() =>
      store.sessions().filter(s => s.expiryDate.getTime() > store.now())
    ),
    // Server total, not an inferred count from this page or the user catalog.
    sessionCount: computed(() => store.total())
  })),
  withMethods(
    (
      store,
      query = inject(GetUserSessionsUseCase),
      revoke = inject(RevokeUserSessionUseCase),
      bulk = inject(RevokeUserSessionsUseCase)
    ) => {
      let pending = 0,
        latestLoad = 0
      const failure = (e: unknown) =>
        Result.failure(e instanceof UserSessionError ? e : new UserSessionError("UNEXPECTED"))
      function loadSessions(
        input: UserSessionQuery = store.query(),
        canCorrect = true
      ): Observable<Result<UserSessionPage, UserSessionError>> {
        const snapshot = { ...input }
        return defer(() => {
          const load = ++latestLoad
          pending++
          patchState(store, { loading: true, error: undefined, query: snapshot, now: Date.now() })
          return defer(() => query.execute(snapshot)).pipe(
            catchError(e => of(failure(e))),
            switchMap(result => {
              if (load !== latestLoad) return of(result)
              if (
                canCorrect &&
                result.success &&
                result.data.page > 0 &&
                result.data.items.length === 0 &&
                result.data.page >= result.data.totalPages
              ) {
                return loadSessions(
                  { ...snapshot, page: Math.max(0, result.data.totalPages - 1) },
                  false
                )
              }
              if (result.success)
                patchState(store, {
                  sessions: result.data.items,
                  page: result.data.page,
                  size: result.data.size,
                  total: result.data.total,
                  totalPages: result.data.totalPages,
                  loaded: true,
                  error: undefined,
                  now: Date.now()
                })
              else patchState(store, { error: result.error })
              return of(result)
            }),
            finalize(() => {
              pending--
              patchState(store, { loading: pending > 0 })
            })
          )
        })
      }
      function refreshAfterWrite(result: Result<void, UserSessionError>) {
        if (!result.success) return of(result)
        latestLoad++
        // Never discard records optimistically: bulk on the caller retains actual=true.
        return loadSessions().pipe(map(() => result))
      }
      return {
        refreshClock() {
          patchState(store, { now: Date.now() })
        },
        loadSessions,
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
