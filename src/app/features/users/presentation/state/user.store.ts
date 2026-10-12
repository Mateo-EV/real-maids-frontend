import { CreateUserUseCase } from "@/app/features/users/application/use-cases/create-user.use-case"
import { DeleteUserByIdUseCase } from "@/app/features/users/application/use-cases/delete-user-by-id.use-case"
import { GetUsersUseCase } from "@/app/features/users/application/use-cases/get-users.use-case"
import { UpdateUserStatusByIdUseCase } from "@/app/features/users/application/use-cases/update-user-status-by-id.use-case"
import { UpdateUserByIdUseCase } from "@/app/features/users/application/use-cases/update-user-by-id.use-case"
import { User } from "@/app/features/users/domain/entities/user.entity"
import { UserError } from "@/app/features/users/domain/errors/user.error"
import { CreateUserParams } from "@/app/features/users/domain/params/create-user.params"
import { UpdateUserParams } from "@/app/features/users/domain/params/update-user.params"
import { Result } from "@/app/shared/utils/result"
import { inject } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import {
  catchError,
  defaultIfEmpty,
  defer,
  finalize,
  map,
  Observable,
  of,
  Subject,
  switchMap,
  takeUntil,
  tap
} from "rxjs"

interface UserState {
  readonly users: User[]
  readonly loading: boolean
  readonly loaded: boolean
  readonly error: UserError | undefined
}
const initialUserState: UserState = {
  users: [],
  loading: false,
  loaded: false,
  error: undefined
}

export const UserStore = signalStore(
  { providedIn: "root" },
  withState(initialUserState),
  withMethods(
    (
      store,
      getUsers = inject(GetUsersUseCase),
      create = inject(CreateUserUseCase),
      update = inject(UpdateUserByIdUseCase),
      status = inject(UpdateUserStatusByIdUseCase),
      remove = inject(DeleteUserByIdUseCase)
    ) => {
      let pending = 0
      let revision = 0
      let latestLoad = 0
      const cancelLoad = new Subject<void>()
      const execute = <T>(request: () => Observable<Result<T, UserError>>) =>
        defer(() => {
          pending++
          patchState(store, { loading: true, error: undefined })
          return defer(request).pipe(
            catchError(error =>
              of(Result.failure(error instanceof UserError ? error : new UserError("UNEXPECTED")))
            ),
            finalize(() => {
              pending--
              patchState(store, { loading: pending > 0 })
            })
          )
        })
      const loadUsers = (): Observable<Result<User[], UserError>> =>
        defer(() => {
          cancelLoad.next()
          patchState(store, { loaded: false })
          const requestId = ++latestLoad,
            snapshot = revision
          return execute(() =>
            getUsers
              .execute()
              .pipe(defaultIfEmpty(Result.failure(new UserError("INVALID_RESPONSE"))))
          ).pipe(
            tap(result => {
              if (requestId !== latestLoad || snapshot !== revision) return
              if (result.success) {
                patchState(store, {
                  users: result.data,
                  loaded: true,
                  error: undefined
                })
              } else patchState(store, { error: result.error })
            }),
            takeUntil(cancelLoad),
            defaultIfEmpty(Result.failure(new UserError("CANCELLED")))
          )
        })
      const mutate = <T>(
        request: () => Observable<Result<T, UserError>>
      ): Observable<Result<T, UserError>> =>
        execute(request).pipe(
          switchMap(result => {
            if (!result.success && result.error.code !== "PARTIAL_UPDATE") {
              patchState(store, { error: result.error })
              return of(result)
            }
            revision++
            // Requery after writes, including partial updates; never replay a mutation.
            return loadUsers().pipe(map(() => result))
          })
        )
      return {
        loadUsers,
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
