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
  takeUntil,
  tap
} from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { GetUserStatisticsUseCase } from "../../application/use-cases/get-user-statistics.use-case"
import { UserError } from "../../domain/errors/user.error"
import { UserStatistics } from "../../domain/models/user-statistics"

/** Page-scoped query state; subscriptions and cancellation belong to the caller. */
export const UserStatisticsStore = signalStore(
  withState({
    result: undefined as UserStatistics | undefined,
    loading: false,
    loaded: false,
    error: undefined as UserError | undefined
  }),
  withMethods((store, read = inject(GetUserStatisticsUseCase)) => {
    let latest = 0
    const cancel = new Subject<void>()
    return {
      load(): Observable<Result<UserStatistics, UserError>> {
        return defer(() => {
          cancel.next()
          const id = ++latest
          patchState(store, { loading: true, loaded: false, error: undefined })
          return defer(() => read.execute()).pipe(
            defaultIfEmpty(Result.failure(new UserError("INVALID_RESPONSE"))),
            catchError(error =>
              of(Result.failure(error instanceof UserError ? error : new UserError("UNEXPECTED")))
            ),
            tap(result => {
              if (id !== latest) return
              if (result.success)
                patchState(store, { result: result.data, loaded: true, error: undefined })
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
