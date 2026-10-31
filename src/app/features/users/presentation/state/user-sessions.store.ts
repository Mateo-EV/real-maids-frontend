import { isPlatformBrowser } from "@angular/common"
import { DestroyRef, inject, Injector, PLATFORM_ID, Signal } from "@angular/core"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { createReadResource, ReadResource } from "@/app/shared/state/read-resource"
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
  NEVER,
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

export const SESSION_READ_TTL_MS = 120000
export const SESSION_INACTIVE_HISTORY_LIMIT = 20

export interface SessionDetailState {
  items: UserSession[]
  loading: boolean
  loaded: boolean
  refreshing?: boolean
  expiresAt?: number
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
    refreshing: false,
    countExpiresAt: 0,
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
      const activeDetails = new Map<number, number>()
      type OwnersPage = PaginationResponse<UserSessionOwner>
      type OwnersResult = Result<OwnersPage, UserSessionError>
      type CountResult = Result<number, UserSessionError>
      type DetailResult = Result<UserSession[], UserSessionError>
      // Registries hold coordinators only; all results remain in SignalStore entries.
      const ownerResources = new Map<string, ReadResource<OwnersPage, UserSessionError>>()
      const detailResources = new Map<number, ReadResource<UserSession[], UserSessionError>>()
      const ownerRefresh = new Subject<ReadonlyMap<string, Observable<OwnersResult>>>()
      let userMutationRevision = -1,
        observing = false
      const scope = createSessionReadScope(() => {
        // Remove keyed state before reset/cancellation finalizers can patch it.
        patchState(store, { ownerEntries: {}, details: {} })
        const resources = [...ownerResources.values(), ...detailResources.values()]
        ownerResources.clear()
        detailResources.clear()
        for (const resource of resources) resource.reset()
        countResource.reset()
        patchState(store, { sessionCount: undefined, affectedUserId: undefined })
      })
      const checkSession = () => {
        const allowed = scope.check()
        if (browser) observing = true
        return allowed
      }
      const normalizeError = (error: unknown) =>
        error instanceof UserSessionError ? error : new UserSessionError("UNEXPECTED")
      const failure = (error: unknown) => Result.failure(normalizeError(error))
      const invalid = () => Result.failure(new UserSessionError("INVALID_RESPONSE"))
      const updateOwners = (key: string, entry: SessionOwnersEntry) =>
        patchState(store, { ownerEntries: { ...store.ownerEntries(), [key]: entry } })
      const updateDetail = (id: number, state: Partial<SessionDetailState>) => {
        const entry = store.details()[id]
        if (entry)
          patchState(store, { details: { ...store.details(), [id]: { ...entry, ...state } } })
      }
      const countResource = createReadResource<number, UserSessionError>({
        scope,
        ttl: SESSION_READ_TTL_MS,
        forcePolicy: "join",
        cancelOnInvalidate: true,
        initialData: () => 0,
        normalizeError,
        request: () => count.execute().pipe(take(1), defaultIfEmpty(invalid())),
        state: {
          get: countResourceState,
          update: update => {
            const state = countResourceState()
            const patch = update(state)
            patchState(store, {
              ...("data" in patch ? { sessionCount: patch.data } : {}),
              ...("loaded" in patch ? { loaded: patch.loaded } : {}),
              ...(patch.pendingReads ? { loaded: state.loaded } : {}),
              ...("pendingReads" in patch
                ? { loading: !!patch.pendingReads && !state.loaded }
                : {}),
              ...("refreshing" in patch ? { refreshing: patch.refreshing } : {}),
              ...("expires" in patch ? { countExpiresAt: patch.expires } : {}),
              ...("error" in patch ? { error: patch.error } : {})
            })
          }
        }
      })
      function countResourceState() {
        return {
          data: store.sessionCount() ?? 0,
          loaded: store.sessionCount() !== undefined,
          refreshing: store.refreshing(),
          expires: store.countExpiresAt(),
          error: store.error()
        }
      }
      const trimOwners = () => {
        const entries = { ...store.ownerEntries() }
        const inactive = Object.keys(entries).filter(
          key => !activeOwners.has(key) && !ownerResources.get(key)?.isPending()
        )
        for (const key of inactive.slice(
          0,
          Math.max(0, inactive.length - SESSION_INACTIVE_HISTORY_LIMIT)
        )) {
          delete entries[key]
          ownerResources.delete(key)
        }
        patchState(store, { ownerEntries: entries })
      }
      const disposeOwners = (key: string) => {
        if (activeOwners.has(key)) return
        if (!store.ownerEntries()[key]?.result) {
          const entries = { ...store.ownerEntries() }
          delete entries[key]
          ownerResources.delete(key)
          patchState(store, { ownerEntries: entries })
        }
        trimOwners()
      }
      const trimDetails = () => {
        const entries = { ...store.details() }
        const inactive = Object.keys(entries)
          .map(Number)
          .filter(id => !activeDetails.has(id) && !detailResources.get(id)?.isPending())
        for (const id of inactive.slice(
          0,
          Math.max(0, inactive.length - SESSION_INACTIVE_HISTORY_LIMIT)
        )) {
          delete entries[id]
          detailResources.delete(id)
        }
        patchState(store, { details: entries })
      }
      destroyRef.onDestroy(() => {
        ownerRefresh.complete()
        activeOwners.clear()
        activeDetails.clear()
      })
      const readOwners = (
        query: UserSessionOwnerQuery,
        delay: number,
        key = ownersQueryKey(query),
        force = false
      ): Observable<OwnersResult> =>
        defer(() => {
          if (!checkSession()) return EMPTY
          if (!store.ownerEntries()[key])
            updateOwners(key, { query, loading: false, loaded: false })
          let resource = ownerResources.get(key)
          if (!resource) {
            const emptyPage = (): OwnersPage => ({ items: [], total: 0, offset: 0, limit: 5 })
            const state = () => {
              const entry = store.ownerEntries()[key]
              return {
                data: entry?.result ?? emptyPage(),
                loaded: !!entry?.result,
                refreshing: entry?.refreshing ?? false,
                expires: entry?.expiresAt ?? 0,
                error: entry?.error
              }
            }
            resource = createReadResource<OwnersPage, UserSessionError>({
              scope,
              ttl: SESSION_READ_TTL_MS,
              forcePolicy: "join",
              cancelOnInvalidate: true,
              initialData: emptyPage,
              normalizeError,
              request: () => requestOwners(query, true),
              state: {
                get: state,
                update: update => {
                  const entry = store.ownerEntries()[key]
                  if (!entry) return
                  const current = state(),
                    patch = update(current)
                  const data = patch.data
                  updateOwners(key, {
                    ...entry,
                    ...(data
                      ? {
                          result: data,
                          query: { ...entry.query, offset: data.offset, limit: data.limit }
                        }
                      : {}),
                    ...("loaded" in patch ? { loaded: patch.loaded! } : {}),
                    ...(patch.pendingReads ? { loaded: current.loaded } : {}),
                    ...("pendingReads" in patch
                      ? { loading: !!patch.pendingReads && !current.loaded }
                      : {}),
                    ...("refreshing" in patch ? { refreshing: patch.refreshing } : {}),
                    ...("expires" in patch ? { expiresAt: patch.expires } : {}),
                    ...("error" in patch ? { error: patch.error } : {})
                  })
                }
              }
            })
            ownerResources.set(key, resource)
          }
          const generation = scope.generation()
          function requestOwners(
            q: UserSessionOwnerQuery,
            mayClamp: boolean
          ): Observable<OwnersResult> {
            return defer(() => injector.get(GetSessionOwnersUseCase).execute(q)).pipe(
              take(1),
              defaultIfEmpty(invalid()),
              switchMap(result => {
                if (!result.success) return of(result)
                const page = result.data
                const last = Math.max(0, Math.ceil(page.total / page.limit) - 1) * page.limit
                if (page.offset <= last) return of(result)
                if (!mayClamp) return of(invalid())
                const clamped = { ...q, offset: last, limit: page.limit }
                const entry = store.ownerEntries()[key]
                if (entry && generation === scope.generation())
                  updateOwners(key, { ...entry, query: clamped })
                return requestOwners(clamped, false)
              })
            )
          }
          return resource
            .read(force, () => {
              const entry = store.ownerEntries()[key]
              if (entry) updateOwners(key, { ...entry, query })
              return (delay > 0 ? timer(delay) : of(0)).pipe(
                switchMap(() => requestOwners(query, true))
              )
            })
            .pipe(finalize(trimOwners))
        })
      const loadDetails = (userId: number, force = false): Observable<DetailResult> =>
        defer(() => {
          if (!checkSession()) return EMPTY
          if (!store.details()[userId])
            patchState(store, { details: { ...store.details(), [userId]: emptyDetail() } })
          let resource = detailResources.get(userId)
          if (!resource) {
            const state = () => {
              const entry = store.details()[userId]
              return {
                data: entry?.items ?? [],
                loaded: entry?.expiresAt !== undefined,
                refreshing: entry?.refreshing ?? false,
                expires: entry?.expiresAt ?? 0,
                error: entry?.error
              }
            }
            resource = createReadResource<UserSession[], UserSessionError>({
              scope,
              ttl: SESSION_READ_TTL_MS,
              forcePolicy: "join",
              cancelOnInvalidate: true,
              initialData: () => [],
              normalizeError,
              request: () => detail.execute(userId).pipe(take(1), defaultIfEmpty(invalid())),
              state: {
                get: state,
                update: update => {
                  const entry = store.details()[userId]
                  if (!entry) return
                  const current = state(),
                    patch = update(current)
                  updateDetail(userId, {
                    ...("data" in patch ? { items: patch.data } : {}),
                    ...("loaded" in patch ? { loaded: patch.loaded } : {}),
                    ...(patch.pendingReads ? { loaded: current.loaded } : {}),
                    ...("pendingReads" in patch
                      ? { loading: !!patch.pendingReads && !current.loaded }
                      : {}),
                    ...("refreshing" in patch ? { refreshing: patch.refreshing } : {}),
                    ...("expires" in patch && (entry.expiresAt !== undefined || patch.loaded)
                      ? { expiresAt: patch.expires }
                      : {}),
                    ...("error" in patch ? { error: patch.error } : {})
                  })
                }
              }
            })
            detailResources.set(userId, resource)
          }
          return resource.read(force).pipe(finalize(trimDetails))
        })
      const invalidateDetail = (id: number) => {
        if (!store.details()[id]) return
        detailResources.get(id)?.invalidate()
        updateDetail(id, { loaded: false, loading: false, refreshing: false })
      }
      const refreshOwners = () => {
        for (const resource of ownerResources.values()) resource.invalidate()
        const entries = store.ownerEntries()
        // One lazy read per active key, including synchronous failures and multiple observers.
        // This event batch never creates a root-owned HTTP subscription.
        ownerRefresh.next(
          new Map(
            Object.entries(entries)
              .filter(([key]) => activeOwners.has(key))
              .map(([key, entry]) => [
                key,
                readOwners(entry.query, 0, key, true).pipe(
                  shareReplay({ bufferSize: 1, refCount: true })
                )
              ])
          )
        )
      }
      const written = (userId: number) => (result: Result<void, UserSessionError>) => {
        if (!result.success) return
        refreshOwners()
        countResource.invalidate()
        invalidateDetail(userId)
        patchState(store, {
          loaded: false,
          loading: false,
          refreshing: false,
          countExpiresAt: 0,
          mutationRevision: store.mutationRevision() + 1,
          affectedUserId: userId
        })
      }
      return {
        refreshOwnersAfterUserMutation(revision: number) {
          if (revision === userMutationRevision) return
          userMutationRevision = revision
          refreshOwners()
          countResource.invalidate()
          for (const id of Object.keys(store.details()).map(Number)) invalidateDetail(id)
        },
        selectOwners(query: Signal<UserSessionOwnerQuery>) {
          return selectSessionOwners(store.ownerEntries, query)
        },
        observeOwners(
          query: UserSessionOwnerQuery,
          delay = 0,
          force = false
        ): Observable<OwnersResult> {
          const snapshot = normalizeOwnersQuery(query)
          return new Observable(subscriber => {
            const key = ownersQueryKey(snapshot)
            activeOwners.set(key, (activeOwners.get(key) ?? 0) + 1)
            // Activity belongs to the consumer, not just the HTTP request.
            const subscription = merge(of(undefined), ownerRefresh)
              .pipe(
                switchMap(batch =>
                  batch ? (batch.get(key) ?? EMPTY) : readOwners(snapshot, delay, key, force)
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
        loadSessionCount(force = false): Observable<CountResult> {
          return defer(() => (checkSession() ? countResource.read(force) : EMPTY))
        },
        loadDetails,
        observeDetails(userId: number, force = false): Observable<DetailResult> {
          return new Observable(subscriber => {
            activeDetails.set(userId, (activeDetails.get(userId) ?? 0) + 1)
            const subscription = merge(loadDetails(userId, force), NEVER).subscribe(subscriber)
            return () => {
              subscription.unsubscribe()
              const remaining = (activeDetails.get(userId) ?? 1) - 1
              if (remaining) activeDetails.set(userId, remaining)
              else activeDetails.delete(userId)
              trimDetails()
            }
          })
        },
        revokeSession(userId: number, id: number) {
          return defer(() => {
            if (observing && !checkSession()) return EMPTY
            const generation = scope.generation()
            if (
              store.details()[userId]?.items.some(session => session.id === id && session.isCurrent)
            )
              return of(Result.failure(new UserSessionError("CURRENT_SESSION")))
            return defer(() => revoke.execute(userId, id)).pipe(
              defaultIfEmpty(invalid()),
              catchError(error => of(failure(error))),
              tap(result => {
                if (generation === scope.generation()) written(userId)(result)
              }),
              takeUntil(scope.cancelled$)
            )
          })
        },
        revokeSessions(userId: number) {
          // The backend retains actual=true on bulk self-revoke; no optimistic deletion.
          return defer(() => {
            if (observing && !checkSession()) return EMPTY
            const generation = scope.generation()
            return defer(() => bulk.execute(userId)).pipe(
              defaultIfEmpty(invalid()),
              catchError(error => of(failure(error))),
              tap(result => {
                if (generation === scope.generation()) written(userId)(result)
              }),
              takeUntil(scope.cancelled$)
            )
          })
        }
      }
    }
  )
)
