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
import { GetSessionOwnersUseCase } from "../../application/use-cases/get-session-owners.use-case"
import { UserSessionOwnerQuery } from "../../domain/models/user-session-owner-query"
import { UserSessionOwner } from "../../domain/models/user-session-owner"
import { UserSessionError } from "../../domain/errors/user-session.error"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"

/** Component-provided query state; subscribers own cancellation and refresh. */
export const UserSessionOwnersStore = signalStore(
  withState({
    query: { offset: 0, limit: 5 } as UserSessionOwnerQuery,
    result: undefined as PaginationResponse<UserSessionOwner> | undefined,
    loading: false,
    loaded: false,
    error: undefined as UserSessionError | undefined
  }),
  withMethods((store, read = inject(GetSessionOwnersUseCase)) => {
    let latest = 0
    const cancel = new Subject<void>()
    const invalid = () => Result.failure(new UserSessionError("INVALID_RESPONSE"))
    return {
      load(
        query: UserSessionOwnerQuery,
        delayMs = 0
      ): Observable<Result<PaginationResponse<UserSessionOwner>, UserSessionError>> {
        const snapshot = { ...query }
        return defer(() => {
          cancel.next()
          const id = ++latest
          patchState(store, {
            query: snapshot,
            loading: true,
            loaded: false,
            error: undefined,
            result: undefined
          })
          const request = (
            q: UserSessionOwnerQuery,
            mayClamp: boolean
          ): Observable<Result<PaginationResponse<UserSessionOwner>, UserSessionError>> =>
            defer(() => read.execute(q)).pipe(
              defaultIfEmpty(invalid()),
              switchMap(result => {
                if (!result.success) return of(result)
                const page = result.data
                const last = Math.max(0, Math.ceil(page.total / page.limit) - 1) * page.limit
                if (page.offset <= last) return of(result)
                if (!mayClamp) return of(invalid())
                const clamped = { ...q, offset: last, limit: page.limit }
                if (id === latest) patchState(store, { query: clamped })
                return request(clamped, false)
              })
            )
          return (delayMs > 0 ? timer(delayMs) : of(0)).pipe(
            switchMap(() => request(snapshot, true)),
            catchError(error =>
              of(
                Result.failure(
                  error instanceof UserSessionError ? error : new UserSessionError("UNEXPECTED")
                )
              )
            ),
            tap(result => {
              if (id !== latest) return
              if (result.success)
                patchState(store, {
                  query: { ...store.query(), offset: result.data.offset, limit: result.data.limit },
                  result: result.data,
                  loaded: true
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
