import { isPlatformBrowser } from "@angular/common"
import { DestroyRef, inject, Injector, PLATFORM_ID, Signal } from "@angular/core"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { GetSessionOwnersUseCase } from "../../application/use-cases/get-session-owners.use-case"
import { UserSessionOwnerQuery } from "../../domain/models/user-session-owner-query"
import { UserSessionOwner } from "../../domain/models/user-session-owner"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import {
  normalizeOwnersQuery,
  ownersQueryKey,
  selectSessionOwners,
  SessionOwnersEntry
} from "./user-session-owners.store"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  EMPTY,
  finalize,
  merge,
  Observable,
  of,
  shareReplay,
  Subject,
  switchMap,
  take,
  takeUntil,
  tap,
  timer
} from "rxjs"
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

/** Root read data; HTTP subscriptions and refresh activity belong to mounted consumers. */
export const UserSessionsStore = signalStore(
  { providedIn: "root" },
  withState({
    ownerEntries: {} as Readonly<Record<string, SessionOwnersEntry>>,
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
      const injector = inject(Injector),
        destroyRef = inject(DestroyRef)
      const browser = isPlatformBrowser(inject(PLATFORM_ID))
      const activeOwners = new Map<string, number>()
      type OwnersResult = Result<PaginationResponse<UserSessionOwner>, UserSessionError>
      const ownerFlights = new Map<string, Observable<OwnersResult>>()
      const sessionCancel = new Subject<void>()
      const ownerCancel = new Subject<void>()
      const ownerRefresh = new Subject<ReadonlyMap<string, Observable<OwnersResult>>>()
      let ownerRevision = 0,
        userMutationRevision = -1
      let sessionGeneration = 0,
        observing = false,
        sessionKey: string | null = null
      const identity = (session: AuthSession | null) =>
        session && (session.expiresAt === null || session.expiresAt > Date.now())
          ? JSON.stringify([session.id, session.email, session.expiresAt])
          : null
      const acceptSession = (session: AuthSession | null) => {
        const key = identity(session)
        if (key === sessionKey) return
        sessionKey = key
        sessionGeneration++
        countRevision++
        detailRevisions.clear()
        ownerRevision++
        ownerFlights.clear()
        detailCancels.clear()
        patchState(store, {
          ownerEntries: {},
          details: {},
          sessionCount: undefined,
          loading: false,
          loaded: false,
          error: undefined,
          affectedUserId: undefined
        })
        sessionCancel.next()
      }
      // Lazy acquisition preserves standalone mutation fixtures; owner reads require real identity.
      const checkSession = () => {
        if (!browser) return false
        const auth = injector.get(AuthStore)
        if (!observing) {
          observing = true
          sessionKey = identity(auth.session())
          const subscription = injector
            .get(ObserveAuthSessionUseCase)
            .execute()
            .subscribe(acceptSession)
          destroyRef.onDestroy(() => subscription.unsubscribe())
        } else acceptSession(auth.session())
        return sessionKey !== null
      }
      const mayRead = () => browser && (!observing || checkSession())
      const updateOwners = (key: string, entry: SessionOwnersEntry) =>
        patchState(store, { ownerEntries: { ...store.ownerEntries(), [key]: entry } })
      const disposeOwners = (key: string) => {
        if (activeOwners.has(key)) return
        const entries = { ...store.ownerEntries() }
        delete entries[key]
        patchState(store, { ownerEntries: entries })
      }
      destroyRef.onDestroy(() => {
        sessionGeneration++
        sessionCancel.next()
        sessionCancel.complete()
        ownerCancel.complete()
        ownerRefresh.complete()
        ownerFlights.clear()
        activeOwners.clear()
        patchState(store, {
          ownerEntries: {},
          details: {},
          sessionCount: undefined,
          loaded: false,
          loading: false
        })
      })
      const readOwners = (
        query: UserSessionOwnerQuery,
        delay: number,
        key = ownersQueryKey(query)
      ): Observable<OwnersResult> =>
        defer(() => {
          if (!checkSession()) return EMPTY
          const existing = ownerFlights.get(key)
          if (existing) return existing
          const generation = sessionGeneration,
            revision = ownerRevision
          const current = () => generation === sessionGeneration && revision === ownerRevision
          updateOwners(key, { query, loading: true, loaded: false })
          const invalid = () => Result.failure(new UserSessionError("INVALID_RESPONSE"))
          const request = (q: UserSessionOwnerQuery, mayClamp: boolean): Observable<OwnersResult> =>
            defer(() => injector.get(GetSessionOwnersUseCase).execute(q)).pipe(
              take(1),
              defaultIfEmpty(invalid()),
              switchMap(result => {
                if (!result.success) return of(result)
                const page = result.data
                const last = Math.max(0, Math.ceil(page.total / page.limit) - 1) * page.limit
                if (page.offset <= last) return of(result)
                if (!mayClamp) return of(invalid())
                const clamped = { ...q, offset: last, limit: page.limit }
                if (current()) updateOwners(key, { query: clamped, loading: true, loaded: false })
                return request(clamped, false)
              })
            )
          const flight = (delay > 0 ? timer(delay) : of(0)).pipe(
            switchMap(() => request(query, true)),
            catchError(error => of(failure(error))),
            tap(result => {
              if (!current()) return
              const effective = store.ownerEntries()[key]?.query ?? query
              updateOwners(
                key,
                result.success
                  ? {
                      query: { ...effective, offset: result.data.offset, limit: result.data.limit },
                      result: result.data,
                      loaded: true,
                      loading: false
                    }
                  : { query: effective, error: result.error, loaded: false, loading: false }
              )
            }),
            takeUntil(sessionCancel),
            takeUntil(ownerCancel),
            finalize(() => {
              if (!current()) return
              ownerFlights.delete(key)
              const entry = store.ownerEntries()[key]
              if (entry) updateOwners(key, { ...entry, loading: false })
            }),
            shareReplay({ bufferSize: 1, refCount: true })
          )
          ownerFlights.set(key, flight)
          return flight
        })
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
      const refreshOwners = () => {
        ownerRevision++
        ownerFlights.clear()
        ownerCancel.next()
        const entries = store.ownerEntries()
        patchState(store, {
          ownerEntries: Object.fromEntries(
            Object.entries(entries).map(([key, entry]) => [
              key,
              { query: entry.query, loading: false, loaded: false }
            ])
          )
        })
        // One lazy read per active key, even for synchronous HTTP fixtures. Only component-owned
        // observers subscribe; this event batch is neither a history cache nor a root subscription.
        ownerRefresh.next(
          new Map(
            Object.entries(entries)
              .filter(([key]) => activeOwners.has(key))
              .map(([key, entry]) => [
                key,
                readOwners(entry.query, 0, key).pipe(shareReplay({ bufferSize: 1, refCount: true }))
              ])
          )
        )
      }
      const written = (userId: number) => (result: Result<void, UserSessionError>) => {
        if (!result.success) return
        refreshOwners()
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
        refreshOwnersAfterUserMutation(revision: number) {
          if (revision === userMutationRevision) return
          userMutationRevision = revision
          refreshOwners()
        },
        selectOwners(query: Signal<UserSessionOwnerQuery>) {
          return selectSessionOwners(store.ownerEntries, query)
        },
        observeOwners(query: UserSessionOwnerQuery, delay = 0): Observable<OwnersResult> {
          const snapshot = normalizeOwnersQuery(query)
          return new Observable(subscriber => {
            const key = ownersQueryKey(snapshot)
            activeOwners.set(key, (activeOwners.get(key) ?? 0) + 1)
            // Keep activity until the consumer switches/destroys, not just until HTTP completes.
            const subscription = merge(of(undefined), ownerRefresh)
              .pipe(
                switchMap(batch =>
                  batch ? (batch.get(key) ?? EMPTY) : readOwners(snapshot, delay)
                )
              )
              .subscribe({
                next: result => subscriber.next(result),
                error: error => subscriber.error(error)
              })
            return () => {
              subscription.unsubscribe()
              const remaining = (activeOwners.get(key) ?? 1) - 1
              if (remaining) activeOwners.set(key, remaining)
              else activeOwners.delete(key)
              disposeOwners(key)
            }
          })
        },
        loadSessionCount() {
          return defer(() => {
            if (!mayRead()) return EMPTY
            const generation = sessionGeneration
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
              takeUntil(sessionCancel),
              finalize(() => {
                if (generation === sessionGeneration && revision === countRevision)
                  patchState(store, { loading: false })
              })
            )
          })
        },
        loadDetails(userId: number) {
          return defer(() => {
            if (!mayRead()) return EMPTY
            const generation = sessionGeneration
            invalidateDetail(userId)
            const revision = detailRevisions.get(userId)!
            const cancel = detailCancels.get(userId) ?? new Subject<void>()
            detailCancels.set(userId, cancel)
            updateDetail(userId, { loading: true, loaded: false, error: undefined })
            return defer(() => detail.execute(userId)).pipe(
              defaultIfEmpty(Result.failure(new UserSessionError("INVALID_RESPONSE"))),
              catchError(error => of(failure(error))),
              tap(result => {
                if (generation !== sessionGeneration || detailRevisions.get(userId) !== revision)
                  return
                if (result.success) updateDetail(userId, { items: result.data, loaded: true })
                else updateDetail(userId, { error: result.error, loaded: false })
              }),
              takeUntil(cancel),
              takeUntil(sessionCancel),
              finalize(() => {
                if (generation === sessionGeneration && detailRevisions.get(userId) === revision)
                  updateDetail(userId, { loading: false })
              })
            )
          })
        },
        revokeSession(userId: number, id: number) {
          return defer(() => {
            if (observing && !checkSession()) return EMPTY
            const generation = sessionGeneration
            if (
              store.details()[userId]?.items.some(session => session.id === id && session.isCurrent)
            )
              return of(Result.failure(new UserSessionError("CURRENT_SESSION")))
            return defer(() => revoke.execute(userId, id)).pipe(
              defaultIfEmpty(Result.failure(new UserSessionError("INVALID_RESPONSE"))),
              catchError(error => of(failure(error))),
              tap(result => {
                if (generation === sessionGeneration) written(userId)(result)
              }),
              takeUntil(sessionCancel)
            )
          })
        },
        revokeSessions(userId: number) {
          // The backend retains actual=true on bulk self-revoke; no optimistic deletion.
          return defer(() => {
            if (observing && !checkSession()) return EMPTY
            const generation = sessionGeneration
            return defer(() => bulk.execute(userId)).pipe(
              defaultIfEmpty(Result.failure(new UserSessionError("INVALID_RESPONSE"))),
              catchError(error => of(failure(error))),
              tap(result => {
                if (generation === sessionGeneration) written(userId)(result)
              }),
              takeUntil(sessionCancel)
            )
          })
        }
      }
    }
  )
)
