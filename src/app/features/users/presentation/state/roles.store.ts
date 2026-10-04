import { inject } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, finalize, Observable, of, tap } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { CreateRoleUseCase } from "../../application/use-cases/create-role.use-case"
import { DeleteRoleByIdUseCase } from "../../application/use-cases/delete-role-by-id.use-case"
import { GetRolesUseCase } from "../../application/use-cases/get-roles.use-case"
import { UpdateRoleByIdUseCase } from "../../application/use-cases/update-role-by-id.use-case"
import { Role } from "../../domain/entities/role.entity"
import { RoleError } from "../../domain/errors/role.error"
import { CreateRoleParams } from "../../domain/params/create-role.params"
import { UpdateRoleParams } from "../../domain/params/update-role.params"

interface RolesState {
  readonly roles: Role[]
  readonly loading: boolean
  readonly loaded: boolean
  readonly error: RoleError | undefined
}
const initialState: RolesState = { roles: [], loading: false, loaded: false, error: undefined }

export const RolesStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withMethods((store,
    getRoles = inject(GetRolesUseCase), createRole = inject(CreateRoleUseCase),
    updateRole = inject(UpdateRoleByIdUseCase), deleteRole = inject(DeleteRoleByIdUseCase)
  ) => {
    let pendingRequests = 0
    let catalogRevision = 0
    let latestLoad = 0

    const execute = <T>(request: () => Observable<Result<T, RoleError>>,
      onSuccess: (data: T) => void,
      isCurrent: () => boolean = () => true
    ): Observable<Result<T, RoleError>> => defer(() => {
      pendingRequests += 1
      patchState(store, { loading: true, error: undefined })
      return defer(request).pipe(
        catchError((error: unknown) => of(Result.failure(
          error instanceof RoleError ? error : new RoleError("UNEXPECTED")
        ))),
        tap(result => {
          if (!isCurrent()) return
          result.either(data => {
            onSuccess(data)
            patchState(store, { error: undefined })
          }, error => patchState(store, { error }))
        }),
        finalize(() => {
          pendingRequests -= 1
          patchState(store, { loading: pendingRequests > 0 })
        })
      )
    })

    return {
      loadRoles() {
        return defer(() => {
          const requestId = ++latestLoad
          const revision = catalogRevision
          return execute(() => getRoles.execute(), roles => patchState(store, { roles, loaded: true }),
            () => requestId === latestLoad && revision === catalogRevision)
        })
      },
      createRole(params: CreateRoleParams) {
        return execute(() => createRole.execute(params), role => {
          catalogRevision += 1
          patchState(store, state => ({ roles: [...state.roles.filter(r => r.id !== role.id), role] }))
        })
      },
      updateRoleById(id: number, params: UpdateRoleParams) {
        return execute(() => updateRole.execute(id, params), role => {
          catalogRevision += 1
          patchState(store, state => ({ roles: state.roles.map(r => r.id === id ? role : r) }))
        })
      },
      deleteRoleById(id: number) {
        return execute(() => deleteRole.execute(id), () => {
          catalogRevision += 1
          patchState(store, state => ({ roles: state.roles.filter(r => r.id !== id) }))
        })
      }
    }
  })
)
