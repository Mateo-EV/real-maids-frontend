import { CreateUserUseCase } from "@/app/features/users/application/use-cases/create-user.use-case"
import { DeleteUserByIdUseCase } from "@/app/features/users/application/use-cases/delete-user-by-id.use-case"
import { GetUsersPageUseCase } from "../../application/use-cases/get-users-page.use-case"
import { UpdateUserStatusByIdUseCase } from "@/app/features/users/application/use-cases/update-user-status-by-id.use-case"
import { UpdateUserByIdUseCase } from "@/app/features/users/application/use-cases/update-user-by-id.use-case"
import { UserError } from "@/app/features/users/domain/errors/user.error"
import { CreateUserParams } from "@/app/features/users/domain/params/create-user.params"
import { UpdateUserParams } from "@/app/features/users/domain/params/update-user.params"
import { UserListQuery } from "../../domain/models/user-list-query"
import { User } from "../../domain/entities/user.entity"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { createSessionReadScope } from "@/app/features/auth/presentation/state/session-read-scope"
import { LINKED_IDENTITY_SYNC } from "@/app/core/config/linked-identity-sync"
import { createReadResource, ReadResourceState } from "@/app/shared/state/read-resource"
import { DestroyRef, inject, Injector, Signal } from "@angular/core"
import { selectUserQuery } from "./user-list.store"
import { selectUserStatistics, UserStatisticsEntry } from "./user-statistics.store"
import { GetUserStatisticsUseCase } from "../../application/use-cases/get-user-statistics.use-case"
import { UserStatistics } from "../../domain/models/user-statistics"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  EMPTY,
  finalize,
  Observable,
  merge,
  switchMap,
  of,
  shareReplay,
  Subject,
  take,
  tap
} from "rxjs"
import { createKeyedReads, keyedState } from "@/app/shared/state/keyed-reads"

type PageResult = Result<PaginationResponse<User>, UserError>
type StatisticsResult = Result<UserStatistics, UserError>
const emptyStatistics: UserStatisticsEntry = {
  result: undefined,
  loading: false,
  refreshing: false,
  error: undefined,
  expires: 0
}
export function normalizeUserQuery(query: UserListQuery): UserListQuery {
  const search = query.search?.trim()
  return {
    offset: query.offset ?? 0,
    limit: query.limit ?? 20,
    ...(search ? { search } : {}),
    ...(query.roleId !== undefined ? { roleId: query.roleId } : {}),
    ...(query.isActive !== undefined ? { isActive: query.isActive } : {})
  }
}
export function userQueryKey(query: UserListQuery): string {
  const q = normalizeUserQuery(query)
  return JSON.stringify([
    String(q.offset),
    String(q.limit),
    q.search ?? "",
    String(q.roleId),
    String(q.isActive)
  ])
}

export interface UserQueryEntry {
  readonly query: UserListQuery
  readonly result: PaginationResponse<User> | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: UserError | undefined
  readonly expires: number
}

interface UserState {
  readonly statistics: UserStatisticsEntry
  readonly entries: Readonly<Record<string, UserQueryEntry>>
  readonly sessionRevision: number
  readonly mutationRevision: number
  readonly loading: boolean
  readonly error: UserError | undefined
}
const initialUserState: UserState = {
  statistics: emptyStatistics,
  entries: {},
  sessionRevision: 0,
  mutationRevision: 0,
  loading: false,
  error: undefined
}

export const UserStore = signalStore(
  { providedIn: "root" },
  withState(initialUserState),
  withMethods(store => {
    const injector = inject(Injector),
      destroyRef = inject(DestroyRef)
    const identitySync = inject(LINKED_IDENTITY_SYNC)
    const normalizeError = (error: unknown) =>
      error instanceof UserError ? error : new UserError("UNEXPECTED")
    const resourceState = <T>(entry: {
      result: T
      refreshing: boolean
      expires: number
      error: UserError | undefined
    }): ReadResourceState<T, UserError> => ({
      data: entry.result,
      loaded: entry.result !== undefined,
      refreshing: entry.refreshing,
      expires: entry.expires,
      error: entry.error
    })
    let mutationStatistics: Observable<StatisticsResult> | undefined
    const invalidations = new Subject<"mutation" | "session">()
    let pending = 0,
      observing = false
    const scope = createSessionReadScope(() => invalidate("session"))
    const checkSession = () => {
      observing = true
      return scope.check()
    }

    const pageRequest = (q: UserListQuery, mayClamp: boolean): Observable<PageResult> =>
      defer(() => injector.get(GetUsersPageUseCase).execute(q)).pipe(
        take(1),
        defaultIfEmpty(Result.failure(new UserError("INVALID_RESPONSE"))),
        switchMap(result => {
          if (!result.success) return of(result)
          const page = result.data
          const lastOffset = Math.max(0, Math.ceil(page.total / page.limit) - 1) * page.limit
          if (page.offset <= lastOffset) return of(result)
          return mayClamp
            ? pageRequest({ ...q, offset: lastOffset, limit: page.limit }, false)
            : of(Result.failure(new UserError("INVALID_RESPONSE")))
        })
      )

    const pages = createKeyedReads<UserListQuery, PaginationResponse<User>, UserError>({
      key: userQueryKey,
      normalize: normalizeUserQuery,
      request: query => pageRequest(query, true),
      adopt: (query, data) => ({ ...query, offset: data.offset, limit: data.limit }),
      state: keyedState(
        () => store.entries(),
        next => patchState(store, { entries: next })
      ),
      scope,
      ttl: 120000,
      normalizeError,
      expireOnError: true,
      noSession: "empty",
      overflow: () => new UserError("UNEXPECTED")
    })

    const statisticsResource = createReadResource<UserStatistics | undefined, UserError>({
      state: {
        get: () => resourceState(store.statistics()),
        update: update => {
          const current = resourceState(store.statistics())
          const patch = update(current)
          const settled = "data" in patch || patch.error !== undefined
          const next = { ...current, ...patch }
          patchState(store, {
            statistics: {
              result: next.data,
              loading:
                !settled &&
                (next.pendingReads ?? statisticsResource.pendingReads) > 0 &&
                !next.loaded,
              refreshing: !settled && next.refreshing,
              expires: next.expires,
              error: next.error
            }
          })
        }
      },
      initialData: () => undefined,
      request: () =>
        defer(() => injector.get(GetUserStatisticsUseCase).execute()).pipe(
          take(1),
          defaultIfEmpty(Result.failure(new UserError("INVALID_RESPONSE")))
        ),
      normalizeError,
      ttl: 120000,
      scope,
      forcePolicy: "join",
      cancelOnInvalidate: true
    })
    const invalidate = (reason: "mutation" | "session") => {
      if (reason === "session") {
        pending = 0
        patchState(store, {
          sessionRevision: store.sessionRevision() + 1,
          loading: false,
          error: undefined
        })
        // Clears keyed pages and their coordinators before the statistics entry resets.
        pages.reset()
        patchState(store, { statistics: emptyStatistics })
        statisticsResource.reset()
      } else {
        // Registry-owned: expires every key and refreshes only active observers, once per key.
        pages.markMutated()
        statisticsResource.invalidate()
      }
      // One lazy mutation read shared even when the source completes/fails synchronously.
      // Only caller-owned observers subscribe; an inactive statistic never refreshes itself.
      mutationStatistics =
        reason === "mutation"
          ? readStatistics(true).pipe(shareReplay({ bufferSize: 1, refCount: true }))
          : undefined
      invalidations.next(reason)
    }
    destroyRef.onDestroy(() => invalidations.complete())
    const execute = <T>(request: () => Observable<Result<T, UserError>>) =>
      defer(() => {
        const started = scope.generation()
        pending++
        patchState(store, { loading: true, error: undefined })
        return defer(request).pipe(
          defaultIfEmpty(Result.failure(new UserError("INVALID_RESPONSE"))),
          catchError(error =>
            of(Result.failure(error instanceof UserError ? error : new UserError("UNEXPECTED")))
          ),
          finalize(() => {
            if (started !== scope.generation()) return
            pending--
            patchState(store, { loading: pending > 0 })
          })
        )
      })
    /**
     * Verified link state for one account, read only from pages this app actually loaded. A found
     * row is real evidence (`customerId` `null` means the backend says it has no customer); no row
     * is no evidence either way, so the relation stays ambiguous instead of invented.
     */
    const verifiedLink = (userId: number): { customerId: number | null } | undefined => {
      for (const entry of Object.values(store.entries())) {
        const user = entry.result?.items.find(candidate => candidate.id === userId)
        if (user) return { customerId: user.customerId }
      }
      return undefined
    }
    /**
     * `PARTIAL_UPDATE` proves the identity PUT committed but returns no record, so the link can
     * come only from a verified page: a linked account expires its identified profile, a verified
     * unlinked account is not CRM identity at all and expires nothing, and no verified record
     * leaves the relation unknown — CRM page variants expire conservatively while no profile id
     * is fabricated.
     */
    const partialEvidence = (userId: number): { customerId: number | null } | undefined => {
      const verified = verifiedLink(userId)
      if (!verified) return { customerId: null }
      return verified.customerId === null ? undefined : { customerId: verified.customerId }
    }
    /**
     * Cross-feature identity evidence. A confirmed profile PUT changed the name/email the CRM
     * shares; `PARTIAL_UPDATE` also means that PUT committed before a later unrelated write
     * failed, so it still carries the identity change. Anything else is not identity.
     */
    const identityEvidence = <T>(
      result: Result<T, UserError>,
      link?: { userId: number; customerIdOf(data: T): number | null }
    ): { customerId: number | null } | undefined => {
      if (!link) return undefined
      if (result.success) {
        const customerId = link.customerIdOf(result.data)
        return customerId === null ? undefined : { customerId }
      }
      return result.error.code === "PARTIAL_UPDATE" ? partialEvidence(link.userId) : undefined
    }
    const mutate = <T>(
      request: () => Observable<Result<T, UserError>>,
      link?: { userId: number; customerIdOf(data: T): number | null }
    ): Observable<Result<T, UserError>> =>
      defer(() => {
        // Evidence only, never a gate: an identity write observes its session before dispatch so a
        // replacement during the flight fences the outbound notification. Without that, a cold
        // store adopted whatever session existed when the result arrived and expired new-session
        // CRM data. Dispatch and result semantics stay exactly as before.
        const sessionObserved = link !== undefined || observing ? checkSession() : false
        const started = scope.generation()
        return execute(request).pipe(
          tap(result => {
            // An old session's dispatched write cannot roll back, but cannot affect the new view.
            if (started !== scope.generation()) return
            const evidence = identityEvidence(result, link)
            if (!result.success) patchState(store, { error: result.error })
            if (result.success || result.error.code === "PARTIAL_UPDATE") {
              patchState(store, { mutationRevision: store.mutationRevision() + 1 })
              invalidate("mutation")
            }
            // Only evidence captured under a still-current session may expire the CRM cache.
            if (evidence && sessionObserved && checkSession())
              identitySync.invalidateCustomerIdentity(evidence.customerId)
          })
        )
      })
    const readPage = (query: UserListQuery, force = false): Observable<PageResult> =>
      defer(() => {
        if (!checkSession()) return EMPTY
        return pages.read(query, force)
      })
    const readStatistics = (force = false): Observable<StatisticsResult> =>
      defer(() => {
        if (!checkSession()) return EMPTY
        return statisticsResource.read(force) as Observable<StatisticsResult>
      })
    return {
      selectStatistics: () => selectUserStatistics(store.statistics),
      /**
       * Cross-feature identity revalidation, not an IAM write: a linked CRM profile edit may have
       * renamed this account. Names/emails decide filter membership, so every page variant
       * expires and no row is patched. Statistics, sessions and audit are not identities and keep
       * their own freshness; only caller-owned observers re-read, so nothing is dispatched here.
       */
      invalidateLinkedIdentity(): void {
        if (!checkSession()) return
        pages.markMutated()
      },
      readStatistics,
      observeStatistics(): Observable<StatisticsResult> {
        return defer(() => {
          checkSession()
          return merge(invalidations, of("initial" as const)).pipe(
            switchMap(reason =>
              reason === "session"
                ? EMPTY
                : reason === "mutation"
                  ? (mutationStatistics ?? EMPTY)
                  : readStatistics()
            )
          )
        })
      },
      selectQuery: (query: Signal<UserListQuery>) =>
        selectUserQuery(store.entries, query, userQueryKey),
      observeQuery(query: UserListQuery, delayMs = 0, force = false): Observable<PageResult> {
        return defer(() => {
          // Auth observation can emit synchronously. Establish it before subscribing below.
          if (!checkSession()) return EMPTY
          return pages.observe(query, { delayMs, force })
        })
      },
      readPage: (query: UserListQuery, force = false) => readPage(query, force),
      createUser: (params: CreateUserParams) =>
        mutate(() => injector.get(CreateUserUseCase).execute(params)),
      updateUserById: (id: number, params: UpdateUserParams) =>
        mutate(() => injector.get(UpdateUserByIdUseCase).execute(id, params), {
          userId: id,
          customerIdOf: user => user.customerId
        }),
      updateUserStatusById: (id: number, isActive: boolean) =>
        mutate(() => injector.get(UpdateUserStatusByIdUseCase).execute(id, isActive)),
      deleteUserById: (id: number) => mutate(() => injector.get(DeleteUserByIdUseCase).execute(id))
    }
  })
)
