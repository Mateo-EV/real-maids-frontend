import { CreateUserUseCase } from "@/app/features/users/application/use-cases/create-user.use-case"
import { DeleteUserByIdUseCase } from "@/app/features/users/application/use-cases/delete-user-by-id.use-case"
import { GetUsersUseCase } from "@/app/features/users/application/use-cases/get-users.use-case"
import { UpdateUserStatusByIdUseCase } from "@/app/features/users/application/use-cases/update-user-status-by-id.use-case"
import { UpdateUserByIdUseCase } from "@/app/features/users/application/use-cases/update-user-by-id.use-case"
import { User } from "@/app/features/users/domain/entities/user.entity"
import { UserError } from "@/app/features/users/domain/errors/user.error"
import { CreateUserParams } from "@/app/features/users/domain/params/create-user.params"
import { UpdateUserParams } from "@/app/features/users/domain/params/update-user.params"
import { UserQuery } from "../../domain/models/user-query"
import { UserPage } from "../../domain/models/user-page"
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
  readonly page: number
  readonly size: number
  readonly total: number
  readonly totalPages: number
  readonly loading: boolean
  readonly loaded: boolean
  readonly error: UserError | undefined
}
const initialUserState: UserState = {
  users: [],
  page: 0,
  size: 50,
  total: 0,
  totalPages: 0,
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
      let query: UserQuery = { page: 0, size: 50 }
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
      const loadUsers = (input: UserQuery = query): Observable<Result<UserPage, UserError>> =>
        defer(() => {
          cancelLoad.next()
          query = { ...input }
          const requestId = ++latestLoad,
            snapshot = revision
          return execute(() =>
            getUsers.execute(query).pipe(
              switchMap(result => {
                if (result.success && result.data.page > Math.max(0, result.data.totalPages - 1)) {
                  query = { ...query, page: Math.max(0, result.data.totalPages - 1) }
                  return getUsers.execute(query)
                }
                return of(result)
              })
            )
          ).pipe(
            tap(result => {
              if (requestId !== latestLoad || snapshot !== revision) return
              if (result.success) {
                const page = result.data
                patchState(store, {
                  users: page.items,
                  page: page.page,
                  size: page.size,
                  total: page.total,
                  totalPages: page.totalPages,
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
            // Sorting, filters and totals are backend-owned. Never append a guessed page after a write.
            return loadUsers(query).pipe(map(() => result))
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
