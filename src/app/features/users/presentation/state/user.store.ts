import { CreateUserUseCase } from "@/app/features/users/application/use-cases/create-user.use-case"
import { DeleteUserByIdUseCase } from "@/app/features/users/application/use-cases/delete-user-by-id.use-case"
import { GetUsersUseCase } from "@/app/features/users/application/use-cases/get-users.use-case"
import { UpdateUserByIdUseCase } from "@/app/features/users/application/use-cases/update-user-by-id.use-case"
import { User } from "@/app/features/users/domain/entities/user.entity"
import { UserError } from "@/app/features/users/domain/errors/user.error"
import { CreateUserParams } from "@/app/features/users/domain/params/create-user.params"
import { UpdateUserParams } from "@/app/features/users/domain/params/update-user.params"
import { Result } from "@/app/shared/utils/result"
import { inject } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, finalize, Observable, of, tap } from "rxjs"

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
      getUsersUseCase = inject(GetUsersUseCase),
      createUserUseCase = inject(CreateUserUseCase),
      updateUserUseCase = inject(UpdateUserByIdUseCase),
      deleteUserUseCase = inject(DeleteUserByIdUseCase)
    ) => {
      let pendingRequests = 0
      let catalogRevision = 0
      let latestLoad = 0

      const execute = <T>(
        request: () => Observable<Result<T, UserError>>,
        onSuccess: (data: T) => void,
        isCurrent: () => boolean = () => true
      ): Observable<Result<T, UserError>> =>
        defer(() => {
          pendingRequests += 1
          patchState(store, { loading: true, error: undefined })
          return defer(request).pipe(
            catchError((error: unknown) =>
              of(Result.failure(error instanceof UserError ? error : new UserError("UNEXPECTED")))
            ),
            tap(result => {
              if (!isCurrent()) return
              result.either(
                data => {
                  onSuccess(data)
                  patchState(store, { error: undefined })
                },
                error => patchState(store, { error })
              )
            }),
            finalize(() => {
              pendingRequests -= 1
              patchState(store, { loading: pendingRequests > 0 })
            })
          )
        })

      return {
        loadUsers() {
          return defer(() => {
            const requestId = ++latestLoad
            const revision = catalogRevision
            return execute(
              () => getUsersUseCase.execute(),
              users => {
                patchState(store, { users, loaded: true })
              },
              () => requestId === latestLoad && revision === catalogRevision
            )
          })
        },
        createUser(params: CreateUserParams) {
          return execute(
            () => createUserUseCase.execute(params),
            user => {
              catalogRevision += 1
              patchState(store, state => ({
                users: [...state.users.filter(u => u.id !== user.id), user]
              }))
            }
          )
        },
        updateUserById(id: number, params: UpdateUserParams) {
          return execute(
            () => updateUserUseCase.execute(id, params),
            user => {
              catalogRevision += 1
              patchState(store, state => ({
                users: state.users.map(u => (u.id === id ? user : u))
              }))
            }
          )
        },
        deleteUserById(id: number) {
          return execute(
            () => deleteUserUseCase.execute(id),
            () => {
              catalogRevision += 1
              patchState(store, state => ({ users: state.users.filter(u => u.id !== id) }))
            }
          )
        }
      }
    }
  )
)
