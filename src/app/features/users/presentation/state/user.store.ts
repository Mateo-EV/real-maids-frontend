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
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { isPlatformBrowser } from "@angular/common"
import { DestroyRef, inject, Injector, PLATFORM_ID, Signal } from "@angular/core"
import { selectUserQuery } from "./user-list.store"
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
  takeUntil,
  tap
} from "rxjs"

type PageResult = Result<PaginationResponse<User>, UserError>
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
  readonly entries: Readonly<Record<string, UserQueryEntry>>
  readonly sessionRevision: number
  readonly mutationRevision: number
  readonly loading: boolean
  readonly error: UserError | undefined
}
const initialUserState: UserState = {
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
    const browser = isPlatformBrowser(inject(PLATFORM_ID))
    // Twenty query variants cover short navigation/search histories without an unbounded catalog.
    const active = new Map<string, number>()
    const updateEntry = (key: string, entry: UserQueryEntry) => {
      const entries = { ...store.entries(), [key]: entry }
      // Active views are pinned; prune the oldest inactive variant, never a visible page.
      while (Object.keys(entries).length > 20) {
        const oldest = Object.keys(entries).find(
          candidate => candidate !== key && !active.has(candidate) && !flights.has(candidate)
        )
        if (!oldest) throw new Error("At most 20 distinct user queries can be active concurrently")
        delete entries[oldest]
      }
      patchState(store, { entries })
    }
    const flights = new Map<string, Observable<PageResult>>()
    const cancelled = new Subject<void>()
    const invalidations = new Subject<"mutation" | "session">()
    let generation = 0,
      sessionGeneration = 0,
      pending = 0,
      observing = false,
      sessionKey: string | null = null
    const identity = (session: AuthSession | null) =>
      session && (session.expiresAt === null || session.expiresAt > Date.now())
        ? JSON.stringify([session.id, session.email, session.expiresAt])
        : null
    const invalidate = (reason: "mutation" | "session") => {
      generation++
      if (reason === "session") {
        sessionGeneration++
        pending = 0
        patchState(store, {
          entries: {},
          sessionRevision: store.sessionRevision() + 1,
          loading: false,
          error: undefined
        })
      } else {
        patchState(store, {
          entries: Object.fromEntries(
            Object.entries(store.entries()).map(([key, entry]) => [
              key,
              { ...entry, expires: 0, loading: false, refreshing: false }
            ])
          )
        })
      }
      flights.clear()
      cancelled.next()
      invalidations.next(reason)
    }
    const acceptSession = (session: AuthSession | null) => {
      const key = identity(session)
      if (key === sessionKey) return
      sessionKey = key
      invalidate("session")
    }
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
    destroyRef.onDestroy(() => {
      patchState(store, { entries: {} })
      flights.clear()
      cancelled.next()
      cancelled.complete()
      invalidations.complete()
    })
    const execute = <T>(request: () => Observable<Result<T, UserError>>) =>
      defer(() => {
        const started = sessionGeneration
        pending++
        patchState(store, { loading: true, error: undefined })
        return defer(request).pipe(
          defaultIfEmpty(Result.failure(new UserError("INVALID_RESPONSE"))),
          catchError(error =>
            of(Result.failure(error instanceof UserError ? error : new UserError("UNEXPECTED")))
          ),
          finalize(() => {
            if (started !== sessionGeneration) return
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
        const started = sessionGeneration
        return execute(request).pipe(
          tap(result => {
            // An old session's dispatched write cannot roll back, but cannot affect the new view.
            if (started !== sessionGeneration) return
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
        const existing = flights.get(key)
        if (existing) return existing
        if (!force && hit?.result && hit.expires > Date.now()) return of(Result.success(hit.result))
        if (
          !hit &&
          Object.keys(store.entries()).length >= 20 &&
          Object.keys(store.entries()).every(
            candidate => active.has(candidate) || flights.has(candidate)
          )
        ) {
          throw new Error("At most 20 distinct user queries can be active concurrently")
        }
        const started = generation
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
        const flight: Observable<PageResult> = defer(() => {
          updateEntry(key, {
            query: hit?.query ?? snapshot,
            result: hit?.result,
            expires: hit?.expires ?? 0,
            loading: !hit?.result,
            refreshing: !!hit?.result,
            error: undefined
          })
          return request(requestQuery, true)
        }).pipe(
          catchError(error =>
            of(Result.failure(error instanceof UserError ? error : new UserError("UNEXPECTED")))
          ),
          takeUntil(cancelled),
          tap(result => {
            if (started !== generation) return
            const entry = store.entries()[key]!
            updateEntry(
              key,
              result.success
                ? {
                    query: { ...snapshot, offset: result.data.offset, limit: result.data.limit },
                    result: result.data,
                    expires: Date.now() + 120000,
                    loading: false,
                    refreshing: false,
                    error: undefined
                  }
                : { ...entry, loading: false, refreshing: false, error: result.error, expires: 0 }
            )
          }),
          finalize(() => {
            if (flights.get(key) !== flight) return
            flights.delete(key)
            const entry = store.entries()[key]
            if (started === generation && entry)
              updateEntry(key, { ...entry, loading: false, refreshing: false })
          }),
          shareReplay({ bufferSize: 1, refCount: true })
        )
        flights.set(key, flight)
        return flight
      })
    }
    return {
      selectQuery: (query: Signal<UserListQuery>) =>
        selectUserQuery(store.entries, query, userQueryKey),
      observeQuery(query: UserListQuery, delayMs = 0, force = false): Observable<PageResult> {
        const snapshot = normalizeUserQuery(query),
          key = userQueryKey(snapshot)
        return defer(() => {
          // Auth observation can emit synchronously. Establish it before subscribing below.
          checkSession()
          if (
            (!active.has(key) && active.size >= 20) ||
            (!store.entries()[key] &&
              Object.keys(store.entries()).length >= 20 &&
              Object.keys(store.entries()).every(
                candidate => active.has(candidate) || flights.has(candidate)
              ))
          ) {
            throw new Error("At most 20 distinct user queries can be active concurrently")
          }
          active.set(key, (active.get(key) ?? 0) + 1)
          const entry = store.entries()[key]
          if (
            delayMs > 0 &&
            sessionKey !== null &&
            !flights.has(key) &&
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
              return (reason === "initial" && delayMs > 0 ? timer(delayMs) : of(0)).pipe(
                switchMap(() =>
                  readPage(
                    snapshot,
                    reason === "initial" && force,
                    reason === "mutation" || force || !!store.entries()[key]?.error
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
                if (entry && !flights.has(key))
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
