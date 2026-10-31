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
import {
  createReadResource,
  ReadResource,
  ReadResourceState
} from "@/app/shared/state/read-resource"
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
  timer,
  of,
  shareReplay,
  Subject,
  take,
  tap
} from "rxjs"

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
    const resources = new Map<
      string,
      ReadResource<PaginationResponse<User> | undefined, UserError>
    >()
    const isPending = (key: string) => resources.get(key)?.isPending() ?? false
    // Twenty query variants cover short navigation/search histories without an unbounded catalog.
    const active = new Map<string, number>()
    const updateEntry = (key: string, entry: UserQueryEntry) => {
      const entries = { ...store.entries(), [key]: entry }
      // Active views are pinned; prune the oldest inactive variant, never a visible page.
      while (Object.keys(entries).length > 20) {
        const oldest = Object.keys(entries).find(
          candidate => candidate !== key && !active.has(candidate) && !isPending(candidate)
        )
        if (!oldest) throw new Error("At most 20 distinct user queries can be active concurrently")
        delete entries[oldest]
        resources.delete(oldest)
      }
      patchState(store, { entries })
    }
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
    // Event-local fan-out, not a second cache: failed synchronous reads must also be
    // delivered once to every active observer, just like mutationStatistics below.
    const mutationPages = new Map<string, Observable<PageResult>>()
    const invalidations = new Subject<"mutation" | "session">()
    let pending = 0,
      observing = false
    const scope = createSessionReadScope(() => invalidate("session"))
    const checkSession = () => {
      observing = true
      return scope.check()
    }
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
      mutationPages.clear()
      if (reason === "session") {
        const previous = [...resources.values()]
        resources.clear()
        pending = 0
        patchState(store, {
          entries: {},
          statistics: emptyStatistics,
          sessionRevision: store.sessionRevision() + 1,
          loading: false,
          error: undefined
        })
        previous.forEach(resource => resource.reset())
        statisticsResource.reset()
      } else {
        resources.forEach(resource => resource.invalidate())
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
    const mutate = <T>(
      request: () => Observable<Result<T, UserError>>
    ): Observable<Result<T, UserError>> =>
      defer(() => {
        if (observing) checkSession()
        const started = scope.generation()
        return execute(request).pipe(
          tap(result => {
            // An old session's dispatched write cannot roll back, but cannot affect the new view.
            if (started !== scope.generation()) return
            if (!result.success) patchState(store, { error: result.error })
            if (result.success || result.error.code === "PARTIAL_UPDATE") {
              patchState(store, { mutationRevision: store.mutationRevision() + 1 })
              invalidate("mutation")
            }
          })
        )
      })
    const readPage = (
      query: UserListQuery,
      force = false,
      effective = false
    ): Observable<PageResult> => {
      const snapshot = normalizeUserQuery(query)
      return defer(() => {
        if (!checkSession()) return EMPTY
        const key = userQueryKey(snapshot),
          hit = store.entries()[key]
        if (
          !hit &&
          Object.keys(store.entries()).length >= 20 &&
          Object.keys(store.entries()).every(
            candidate => active.has(candidate) || isPending(candidate)
          )
        ) {
          throw new Error("At most 20 distinct user queries can be active concurrently")
        }
        const requestQuery = effective && hit ? hit.query : snapshot
        const request = (q: UserListQuery, mayClamp: boolean): Observable<PageResult> =>
          defer(() => injector.get(GetUsersPageUseCase).execute(q)).pipe(
            take(1),
            defaultIfEmpty(Result.failure(new UserError("INVALID_RESPONSE"))),
            switchMap(result => {
              if (!result.success) return of(result)
              const page = result.data
              const lastOffset = Math.max(0, Math.ceil(page.total / page.limit) - 1) * page.limit
              if (page.offset <= lastOffset) return of(result)
              return mayClamp
                ? request({ ...q, offset: lastOffset, limit: page.limit }, false)
                : of(Result.failure(new UserError("INVALID_RESPONSE")))
            })
          )
        if (!hit)
          updateEntry(key, {
            query: snapshot,
            result: undefined,
            expires: 0,
            loading: false,
            refreshing: false,
            error: undefined
          })
        let resource = resources.get(key)
        if (!resource) {
          const coordinator = createReadResource<PaginationResponse<User> | undefined, UserError>({
            state: {
              get: () =>
                resourceState(
                  store.entries()[key] ?? {
                    result: undefined,
                    refreshing: false,
                    expires: 0,
                    error: undefined
                  }
                ),
              update: update => {
                const entry = store.entries()[key]
                // Clearing a session/evicting history must never be undone by teardown.
                if (!entry || resources.get(key) !== coordinator) return
                const patch = update(resourceState(entry))
                const settled = "data" in patch || patch.error !== undefined
                const next = { ...resourceState(entry), ...patch }
                updateEntry(key, {
                  query: patch.data
                    ? { ...snapshot, offset: patch.data.offset, limit: patch.data.limit }
                    : entry.query,
                  result: next.data,
                  loading:
                    !settled && (next.pendingReads ?? coordinator.pendingReads) > 0 && !next.loaded,
                  refreshing: !settled && next.refreshing,
                  expires: patch.error ? 0 : next.expires,
                  error: next.error
                })
              }
            },
            initialData: () => undefined,
            request: () => request(snapshot, true),
            normalizeError,
            ttl: 120000,
            scope,
            forcePolicy: "join",
            cancelOnInvalidate: true
          })
          resource = coordinator
          resources.set(key, resource)
        }
        // Only the factory varies: the normalized cache identity remains unchanged.
        return resource.read(force, () => request(requestQuery, true)) as Observable<PageResult>
      })
    }
    const readStatistics = (force = false): Observable<StatisticsResult> =>
      defer(() => {
        if (!checkSession()) return EMPTY
        return statisticsResource.read(force) as Observable<StatisticsResult>
      })
    return {
      selectStatistics: () => selectUserStatistics(store.statistics),
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
        const snapshot = normalizeUserQuery(query),
          key = userQueryKey(snapshot)
        return defer(() => {
          // Auth observation can emit synchronously. Establish it before subscribing below.
          const hasSession = checkSession()
          if (
            (!active.has(key) && active.size >= 20) ||
            (!store.entries()[key] &&
              Object.keys(store.entries()).length >= 20 &&
              Object.keys(store.entries()).every(
                candidate => active.has(candidate) || isPending(candidate)
              ))
          ) {
            throw new Error("At most 20 distinct user queries can be active concurrently")
          }
          active.set(key, (active.get(key) ?? 0) + 1)
          const entry = store.entries()[key]
          if (
            delayMs > 0 &&
            hasSession &&
            !isPending(key) &&
            (force || !entry || entry.expires <= Date.now())
          ) {
            updateEntry(key, {
              query: entry?.query ?? snapshot,
              result: entry?.result,
              expires: entry?.expires ?? 0,
              error: undefined,
              loading: !entry?.result,
              refreshing: !!entry?.result
            })
          }
          return merge(invalidations, of("initial" as const)).pipe(
            switchMap(reason => {
              if (reason === "session") return EMPTY
              if (reason === "mutation") {
                let batch = mutationPages.get(key)
                if (!batch) {
                  batch = readPage(snapshot, false, true).pipe(
                    shareReplay({ bufferSize: 1, refCount: true })
                  )
                  mutationPages.set(key, batch)
                }
                return batch
              }
              return (reason === "initial" && delayMs > 0 ? timer(delayMs) : of(0)).pipe(
                switchMap(() =>
                  readPage(
                    snapshot,
                    reason === "initial" && force,
                    force || !!store.entries()[key]?.error
                  )
                )
              )
            }),
            finalize(() => {
              const count = (active.get(key) ?? 1) - 1
              if (count) active.set(key, count)
              else {
                active.delete(key)
                const entry = store.entries()[key]
                if (entry && !isPending(key))
                  updateEntry(key, { ...entry, loading: false, refreshing: false })
              }
            })
          )
        })
      },
      readPage: (query: UserListQuery, force = false) => readPage(query, force),
      createUser: (params: CreateUserParams) =>
        mutate(() => injector.get(CreateUserUseCase).execute(params)),
      updateUserById: (id: number, params: UpdateUserParams) =>
        mutate(() => injector.get(UpdateUserByIdUseCase).execute(id, params)),
      updateUserStatusById: (id: number, isActive: boolean) =>
        mutate(() => injector.get(UpdateUserStatusByIdUseCase).execute(id, isActive)),
      deleteUserById: (id: number) => mutate(() => injector.get(DeleteUserByIdUseCase).execute(id))
    }
  })
)
