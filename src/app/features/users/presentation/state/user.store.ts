import { CreateUserUseCase } from "@/app/features/users/application/use-cases/create-user.use-case"
import { DeleteUserByIdUseCase } from "@/app/features/users/application/use-cases/delete-user-by-id.use-case"
import { UpdateUserStatusByIdUseCase } from "@/app/features/users/application/use-cases/update-user-status-by-id.use-case"
import { UpdateUserByIdUseCase } from "@/app/features/users/application/use-cases/update-user-by-id.use-case"
import { UserError } from "@/app/features/users/domain/errors/user.error"
import { CreateUserParams } from "@/app/features/users/domain/params/create-user.params"
import { UpdateUserParams } from "@/app/features/users/domain/params/update-user.params"
import { Result } from "@/app/shared/utils/result"
import { inject } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import { catchError, defaultIfEmpty, defer, finalize, Observable, of, tap } from "rxjs"

interface UserState {
  readonly mutationRevision: number
  readonly loading: boolean
  readonly error: UserError | undefined
}
const initialUserState: UserState = {
  mutationRevision: 0,
  loading: false,
  error: undefined
}

export const UserStore = signalStore(
  { providedIn: "root" },
  withState(initialUserState),
  withMethods(
    (
      store,
      create = inject(CreateUserUseCase),
      update = inject(UpdateUserByIdUseCase),
      status = inject(UpdateUserStatusByIdUseCase),
      remove = inject(DeleteUserByIdUseCase)
    ) => {
      let pending = 0
      const execute = <T>(request: () => Observable<Result<T, UserError>>) =>
        defer(() => {
          pending++
          patchState(store, { loading: true, error: undefined })
          return defer(request).pipe(
            defaultIfEmpty(Result.failure(new UserError("INVALID_RESPONSE"))),
            catchError(error =>
              of(Result.failure(error instanceof UserError ? error : new UserError("UNEXPECTED")))
            ),
            finalize(() => {
              pending--
              patchState(store, { loading: pending > 0 })
            })
          )
        })
      const mutate = <T>(
        request: () => Observable<Result<T, UserError>>
      ): Observable<Result<T, UserError>> =>
        execute(request).pipe(
          tap(result => {
            if (!result.success) patchState(store, { error: result.error })
            if (result.success || result.error.code === "PARTIAL_UPDATE") {
              // Consumers own scoped refreshes; the facade never reads or replays writes.
              patchState(store, { mutationRevision: store.mutationRevision() + 1 })
            }
          })
        )
      return {
        createUser: (params: CreateUserParams) => mutate(() => create.execute(params)),
        updateUserById: (id: number, params: UpdateUserParams) =>
          mutate(() => update.execute(id, params)),
        updateUserStatusById: (id: number, isActive: boolean) =>
          mutate(() => status.execute(id, isActive)),
        deleteUserById: (id: number) => mutate(() => remove.execute(id))
      }
    }
  )
)
