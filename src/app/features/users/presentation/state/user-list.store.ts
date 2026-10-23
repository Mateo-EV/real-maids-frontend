import { inject } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import {
  defer,
  finalize,
  merge,
  Observable,
  of,
  Subject,
  switchMap,
  takeUntil,
  tap,
  timer
} from "rxjs"
import { UserListQuery } from "../../domain/models/user-list-query"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { User } from "../../domain/entities/user.entity"
import { UserError } from "../../domain/errors/user.error"
import { Result } from "@/app/shared/utils/result"
import { normalizeUserQuery, userQueryKey, UserStore } from "./user.store"

interface UserListState {
  query: UserListQuery
  result: PaginationResponse<User> | undefined
  loading: boolean
  refreshing: boolean
  loaded: boolean
  error: UserError | undefined
  sessionRevision: number
}

/** Each caller owns its subscription, including invalidation-driven background reads. */
export const UserListStore = signalStore(
  withState<UserListState>({
    query: { offset: 0, limit: 10 },
    result: undefined,
    loading: false,
    refreshing: false,
    loaded: false,
    error: undefined,
    sessionRevision: 0
  }),
  withMethods((store, users = inject(UserStore)) => {
    let latest = 0
    const cancel = new Subject<void>()
    return {
      load(
        query: UserListQuery,
        delayMs = 0,
        force = false
      ): Observable<Result<PaginationResponse<User>, UserError>> {
        const snapshot = normalizeUserQuery(query)
        return defer(() => {
          cancel.next()
          const id = ++latest
          const sameQuery = userQueryKey(snapshot) === userQueryKey(store.query())
          if (!sameQuery) patchState(store, { result: undefined, loaded: false })
          patchState(store, { query: snapshot })
          return merge(users.observeInvalidations(), of("initial" as const)).pipe(
            switchMap(reason => {
              if (reason === "initial") {
                const cached = users.getCachedPage(snapshot)
                const lastOffset = cached
                  ? Math.max(0, Math.ceil(cached.total / cached.limit) - 1) * cached.limit
                  : 0
                if (cached && cached.offset <= lastOffset)
                  patchState(store, {
                    result: cached,
                    query: { ...snapshot, offset: cached.offset, limit: cached.limit },
                    loaded: true
                  })
              }
              if (reason === "session")
                patchState(store, {
                  result: undefined,
                  loaded: false,
                  error: undefined,
                  sessionRevision: store.sessionRevision() + 1
                })
              const preserve = store.loaded() && store.result() !== undefined
              patchState(store, { loading: !preserve, refreshing: preserve, error: undefined })
              const request = (
                q: UserListQuery,
                mayClamp: boolean
              ): Observable<Result<PaginationResponse<User>, UserError>> =>
                users.readPage(q, force && reason === "initial").pipe(
                  switchMap(result => {
                    if (!result.success) return of(result)
                    const page = result.data
                    const lastOffset =
                      Math.max(0, Math.ceil(page.total / page.limit) - 1) * page.limit
                    if (page.offset <= lastOffset) return of(result)
                    if (!mayClamp) return of(Result.failure(new UserError("INVALID_RESPONSE")))
                    // Do not relabel the preserved page while the clamped request is pending.
                    return request({ ...q, offset: lastOffset, limit: page.limit }, false)
                  })
                )
              const activeQuery = reason === "initial" ? snapshot : { ...store.query() }
              return (reason === "initial" && delayMs > 0 ? timer(delayMs) : of(0)).pipe(
                switchMap(() => request(activeQuery, true)),
                tap(result => {
                  if (id !== latest) return
                  if (result.success)
                    patchState(store, {
                      query: {
                        ...activeQuery,
                        offset: result.data.offset,
                        limit: result.data.limit
                      },
                      result: result.data,
                      loaded: true,
                      error: undefined
                    })
                  else patchState(store, { error: result.error })
                }),
                finalize(() => {
                  if (id === latest) patchState(store, { loading: false, refreshing: false })
                })
              )
            }),
            takeUntil(cancel),
            finalize(() => {
              if (id === latest) patchState(store, { loading: false, refreshing: false })
            })
          )
        })
      }
    }
  })
)
