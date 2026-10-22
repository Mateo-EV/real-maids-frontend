import { inject } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import { catchError, defaultIfEmpty, defer, finalize, of, Subject, takeUntil, tap } from "rxjs"
import { GetSessionCountUseCase } from "../../application/use-cases/get-session-count.use-case"
import { GetUserSessionsByUserUseCase } from "../../application/use-cases/get-user-sessions-by-user.use-case"
import { RevokeUserSessionUseCase } from "../../application/use-cases/revoke-user-session.use-case"
import { RevokeUserSessionsUseCase } from "../../application/use-cases/revoke-user-sessions.use-case"
import { UserSession } from "../../domain/entities/user-session.entity"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { Result } from "@/app/shared/utils/result"

export interface SessionDetailState {
  items: UserSession[]
  loading: boolean
  loaded: boolean
  error?: UserSessionError
}
const emptyDetail = (): SessionDetailState => ({ items: [], loading: false, loaded: false })

/** Root data, never root-owned subscriptions. Read refreshes belong to mounted consumers. */
export const UserSessionsStore = signalStore(
  { providedIn: "root" },
  withState({
    sessionCount: undefined as number | undefined,
    loading: false,
    loaded: false,
    error: undefined as UserSessionError | undefined,
    details: {} as Record<number, SessionDetailState>,
    mutationRevision: 0,
    affectedUserId: undefined as number | undefined
  }),
  withMethods(
    (
      store,
      count = inject(GetSessionCountUseCase),
      detail = inject(GetUserSessionsByUserUseCase),
      revoke = inject(RevokeUserSessionUseCase),
      bulk = inject(RevokeUserSessionsUseCase)
    ) => {
      let countRevision = 0
      const countCancel = new Subject<void>()
      const detailRevisions = new Map<number, number>()
      const detailCancels = new Map<number, Subject<void>>()
      const failure = (error: unknown) =>
        Result.failure(
          error instanceof UserSessionError ? error : new UserSessionError("UNEXPECTED")
        )
      const updateDetail = (id: number, state: Partial<SessionDetailState>) =>
        patchState(store, {
          details: {
            ...store.details(),
            [id]: { ...(store.details()[id] ?? emptyDetail()), ...state }
          }
        })
      const invalidateDetail = (id: number) => {
        detailCancels.get(id)?.next()
        detailRevisions.set(id, (detailRevisions.get(id) ?? 0) + 1)
        updateDetail(id, { loaded: false, loading: false })
      }
      const written = (userId: number) => (result: Result<void, UserSessionError>) => {
        if (!result.success) return
        countCancel.next()
        ++countRevision
        invalidateDetail(userId)
        patchState(store, {
          loaded: false,
          loading: false,
          mutationRevision: store.mutationRevision() + 1,
          affectedUserId: userId
        })
      }
      return {
        loadSessionCount() {
          return defer(() => {
            countCancel.next()
            const revision = ++countRevision
            patchState(store, { loading: true, loaded: false, error: undefined })
            return defer(() => count.execute()).pipe(
              defaultIfEmpty(Result.failure(new UserSessionError("INVALID_RESPONSE"))),
              catchError(error => of(failure(error))),
              tap(result => {
                if (revision !== countRevision) return
                if (result.success) patchState(store, { sessionCount: result.data, loaded: true })
                else patchState(store, { error: result.error })
              }),
              takeUntil(countCancel),
              finalize(() => {
                if (revision === countRevision) patchState(store, { loading: false })
              })
            )
          })
        },
        loadDetails(userId: number) {
          return defer(() => {
            invalidateDetail(userId)
            const revision = detailRevisions.get(userId)!
            const cancel = detailCancels.get(userId) ?? new Subject<void>()
            detailCancels.set(userId, cancel)
            updateDetail(userId, { loading: true, loaded: false, error: undefined })
            return defer(() => detail.execute(userId)).pipe(
              defaultIfEmpty(Result.failure(new UserSessionError("INVALID_RESPONSE"))),
              catchError(error => of(failure(error))),
              tap(result => {
                if (detailRevisions.get(userId) !== revision) return
                if (result.success) updateDetail(userId, { items: result.data, loaded: true })
                else updateDetail(userId, { error: result.error, loaded: false })
              }),
              takeUntil(cancel),
              finalize(() => {
                if (detailRevisions.get(userId) === revision)
                  updateDetail(userId, { loading: false })
              })
            )
          })
        },
        revokeSession(userId: number, id: number) {
          return defer(() => {
            if (
              store.details()[userId]?.items.some(session => session.id === id && session.isCurrent)
            )
              return of(Result.failure(new UserSessionError("CURRENT_SESSION")))
            return revoke.execute(userId, id)
          }).pipe(
            defaultIfEmpty(Result.failure(new UserSessionError("INVALID_RESPONSE"))),
            catchError(error => of(failure(error))),
            tap(written(userId))
          )
        },
        revokeSessions(userId: number) {
          // The backend retains actual=true on bulk self-revoke; no optimistic deletion.
          return defer(() => bulk.execute(userId)).pipe(
            defaultIfEmpty(Result.failure(new UserSessionError("INVALID_RESPONSE"))),
            catchError(error => of(failure(error))),
            tap(written(userId))
          )
        }
      }
    }
  )
)
