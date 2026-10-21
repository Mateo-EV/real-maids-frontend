import { inject } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  finalize,
  Observable,
  of,
  Subject,
  switchMap,
  takeUntil,
  tap,
  timer
} from "rxjs"
import { GetUsersPageUseCase } from "../../application/use-cases/get-users-page.use-case"
import { UserListQuery } from "../../domain/models/user-list-query"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { User } from "../../domain/entities/user.entity"
import { UserError } from "../../domain/errors/user.error"
import { Result } from "@/app/shared/utils/result"

interface UserListState {
  query: UserListQuery
  result: PaginationResponse<User> | undefined
  loading: boolean
  loaded: boolean
  error: UserError | undefined
}

/** Provided by the page. The caller owns every subscription, including post-write refreshes. */
export const UserListStore = signalStore(
  withState<UserListState>({
    query: { offset: 0, limit: 10 },
    result: undefined,
    loading: false,
    loaded: false,
    error: undefined
  }),
  withMethods((store, read = inject(GetUsersPageUseCase)) => {
    let latest = 0
    const cancel = new Subject<void>()
    const invalid = () => Result.failure(new UserError("INVALID_RESPONSE"))
    return {
      load(
        query: UserListQuery,
        delayMs = 0
      ): Observable<Result<PaginationResponse<User>, UserError>> {
        const snapshot = { ...query }
        return defer(() => {
          cancel.next()
          const id = ++latest
          patchState(store, {
            query: snapshot,
            loading: true,
            loaded: false,
            error: undefined,
            result: store.result() ? { ...store.result()!, items: [] } : undefined
          })
          const request = (
            q: UserListQuery,
            mayClamp: boolean
          ): Observable<Result<PaginationResponse<User>, UserError>> =>
            defer(() => read.execute(q)).pipe(
              defaultIfEmpty(invalid()),
              switchMap(result => {
                if (!result.success) return of(result)
                const page = result.data
                const lastOffset = Math.max(0, Math.ceil(page.total / page.limit) - 1) * page.limit
                if (page.offset <= lastOffset) return of(result)
                if (!mayClamp) return of(invalid())
                const clamped = { ...q, offset: lastOffset, limit: page.limit }
                if (id === latest) patchState(store, { query: clamped })
                return request(clamped, false)
              })
            )
          return (delayMs > 0 ? timer(delayMs) : of(0)).pipe(
            switchMap(() => request(snapshot, true)),
            catchError(error =>
              of(Result.failure(error instanceof UserError ? error : new UserError("UNEXPECTED")))
            ),
            tap(result => {
              if (id !== latest) return
              if (result.success)
                patchState(store, {
                  query: { ...store.query(), offset: result.data.offset, limit: result.data.limit },
                  result: result.data,
                  loaded: true,
                  error: undefined
                })
              else patchState(store, { error: result.error, loaded: false })
            }),
            takeUntil(cancel),
            finalize(() => {
              if (id === latest) patchState(store, { loading: false })
            })
          )
        })
      }
    }
  })
)
