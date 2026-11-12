import { isPlatformBrowser } from "@angular/common"
import { inject, Injector, PLATFORM_ID, Signal } from "@angular/core"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { createReadResource, ReadScope } from "@/app/shared/state/read-resource"
import { createKeyedReads, KeyedEntry, keyedState } from "@/app/shared/state/keyed-reads"
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
  Observable,
  of,
  switchMap,
  take,
  takeUntil,
  tap
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

type OwnersPage = PaginationResponse<UserSessionOwner>
type OwnersResult = Result<OwnersPage, UserSessionError>
type CountResult = Result<number, UserSessionError>
type DetailResult = Result<UserSession[], UserSessionError>
type OwnerEntry = KeyedEntry<UserSessionOwnerQuery, OwnersPage, UserSessionError>
type DetailEntry = KeyedEntry<number, UserSession[], UserSessionError>
type DetailState = Record<number, SessionDetailState>

/**
 * The two registry families cap only their inactive history. The pre-migration store refused no
 * admission and dropped no active view, so the total-entry bound must never clamp them.
 */
const UNBOUNDED_ACTIVE_READS = Number.POSITIVE_INFINITY

/** Public owner entries keep `loaded`/`expiresAt`; only the registry adapter speaks `KeyedEntry`. */
const toOwnerEntries = (entries: Readonly<Record<string, SessionOwnersEntry>>) => {
  const keyed: Record<string, OwnerEntry> = {}
  for (const [key, entry] of Object.entries(entries))
    keyed[key] = {
      query: entry.query,
      result: entry.result,
      loading: entry.loading,
      refreshing: entry.refreshing ?? false,
      error: entry.error,
      expires: entry.expiresAt ?? 0
    }
  return keyed
}
const fromOwnerEntries = (entries: Readonly<Record<string, OwnerEntry>>) => {
  const owners: Record<string, SessionOwnersEntry> = {}
  for (const [key, entry] of Object.entries(entries))
    owners[key] = {
      query: entry.query,
      result: entry.result,
      loading: entry.loading,
      // A verified page is the only proof of a loaded owner entry.
      loaded: entry.result !== undefined,
      refreshing: entry.refreshing,
      expiresAt: entry.expires,
      error: entry.error
    }
  return owners
}
const toDetailEntries = (entries: DetailState) => {
  const keyed: Record<string, DetailEntry> = {}
  for (const [key, entry] of Object.entries(entries))
    keyed[key] = {
      query: Number(key),
      // `loaded` is cleared by invalidation while the verified rows and their freshness marker
      // stay: only an entry that never produced verified data has no `expiresAt`.
      result: entry.expiresAt !== undefined ? entry.items : undefined,
      loading: entry.loading,
      refreshing: entry.refreshing ?? false,
      error: entry.error,
      expires: entry.expiresAt ?? 0
    }
  return keyed
}
const fromDetailEntries = (
  entries: Readonly<Record<string, DetailEntry>>,
  previous: DetailState
) => {
  const details: DetailState = {}
  for (const [key, entry] of Object.entries(entries)) {
    const id = Number(key)
    details[id] = {
      // Keep already verified rows visible while the entry is unloaded.
      items: entry.result ?? previous[id]?.items ?? [],
      loading: entry.loading,
      loaded: entry.result !== undefined,
      refreshing: entry.refreshing,
      // An entry that never produced verified data has no freshness marker to carry.
      ...(entry.result !== undefined ? { expiresAt: entry.expires } : {}),
      error: entry.error
    }
  }
  return details
}

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
      const injector = inject(Injector)
      const browser = isPlatformBrowser(inject(PLATFORM_ID))
      let userMutationRevision = -1,
        observing = false
      const normalizeError = (error: unknown) =>
        error instanceof UserSessionError ? error : new UserSessionError("UNEXPECTED")
      const failure = (error: unknown) => Result.failure(normalizeError(error))
      const invalid = () => Result.failure(new UserSessionError("INVALID_RESPONSE"))
      const updateDetail = (id: number, state: Partial<SessionDetailState>) => {
        const entry = store.details()[id]
        if (entry)
          patchState(store, { details: { ...store.details(), [id]: { ...entry, ...state } } })
      }
      const scope = createSessionReadScope(() => {
        // Remove keyed state before reset/cancellation finalizers can patch it.
        patchState(store, { ownerEntries: {}, details: {} })
        owners.reset()
        details.reset()
        countResource.reset()
        patchState(store, { sessionCount: undefined, affectedUserId: undefined })
      })
      const checkSession = () => {
        const allowed = scope.check()
        if (browser) observing = true
        return allowed
      }
      // Registry scopes check the auth session themselves, so both families share this guard.
      const sessionScope: ReadScope = {
        check: checkSession,
        generation: () => scope.generation(),
        cancelled$: scope.cancelled$
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
      /** One corrective read to the effective last page; a second out-of-range page is invalid. */
      const requestOwners = (
        query: UserSessionOwnerQuery,
        mayClamp: boolean
      ): Observable<OwnersResult> =>
        defer(() => injector.get(GetSessionOwnersUseCase).execute(query)).pipe(
          take(1),
          defaultIfEmpty(invalid()),
          switchMap(result => {
            if (!result.success) return of(result)
            const page = result.data
            const last = Math.max(0, Math.ceil(page.total / page.limit) - 1) * page.limit
            if (page.offset <= last) return of(result)
            return mayClamp
              ? requestOwners({ ...query, offset: last, limit: page.limit }, false)
              : of(invalid())
          })
        )
      const owners = createKeyedReads<UserSessionOwnerQuery, OwnersPage, UserSessionError>({
        key: ownersQueryKey,
        normalize: normalizeOwnersQuery,
        request: query => requestOwners(query, true),
        // The cache key stays the requested page; the entry records the effective one.
        adopt: (query, page) => ({ ...query, offset: page.offset, limit: page.limit }),
        state: keyedState(
          () => toOwnerEntries(store.ownerEntries()),
          next => patchState(store, { ownerEntries: fromOwnerEntries(next) })
        ),
        scope: sessionScope,
        ttl: SESSION_READ_TTL_MS,
        maxEntries: UNBOUNDED_ACTIVE_READS,
        inactiveHistoryLimit: SESSION_INACTIVE_HISTORY_LIMIT,
        // A query that never produced a verified page is history the consumer never saw.
        dropUnverifiedOnIdle: true,
        noSession: "empty",
        normalizeError,
        overflow: () => new UserSessionError("UNEXPECTED")
      })
      const details = createKeyedReads<number, UserSession[], UserSessionError>({
        key: id => String(id),
        request: id => detail.execute(id).pipe(take(1), defaultIfEmpty(invalid())),
        state: keyedState(
          () => toDetailEntries(store.details()),
          next => patchState(store, { details: fromDetailEntries(next, store.details()) })
        ),
        scope: sessionScope,
        ttl: SESSION_READ_TTL_MS,
        maxEntries: UNBOUNDED_ACTIVE_READS,
        inactiveHistoryLimit: SESSION_INACTIVE_HISTORY_LIMIT,
        noSession: "empty",
        normalizeError,
        overflow: () => new UserSessionError("UNEXPECTED")
      })
      /** Expires one written owner's sessions without refreshing them. */
      const invalidateDetail = (id: number) => {
        if (!store.details()[id]) return
        details.invalidate(String(id))
        updateDetail(id, { loaded: false, loading: false, refreshing: false })
      }
      const written = (userId: number) => (result: Result<void, UserSessionError>) => {
        if (!result.success) return
        owners.markMutated()
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
          owners.markMutated()
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
          return owners.observe(query, { delayMs: delay, force })
        },
        loadSessionCount(force = false): Observable<CountResult> {
          return defer(() => (checkSession() ? countResource.read(force) : EMPTY))
        },
        loadDetails(userId: number, force = false): Observable<DetailResult> {
          return details.read(userId, force)
        },
        observeDetails(userId: number, force = false): Observable<DetailResult> {
          return details.observe(userId, { force })
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
