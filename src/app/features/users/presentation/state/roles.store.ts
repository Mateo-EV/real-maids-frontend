import { computed, inject } from "@angular/core"
import { createSessionReadScope } from "./internal/session-read-scope"
import { createReadResource } from "./internal/read-resource"

import { patchState, signalStore, withComputed, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, EMPTY, finalize, Observable, of, takeUntil, tap } from "rxjs"

import { Result } from "@/app/shared/utils/result"
import { CreateRoleUseCase } from "../../application/use-cases/create-role.use-case"
import { DeleteRoleByIdUseCase } from "../../application/use-cases/delete-role-by-id.use-case"
import { GetRolesUseCase } from "../../application/use-cases/get-roles.use-case"
import { UpdateRoleByIdUseCase } from "../../application/use-cases/update-role-by-id.use-case"
import { Role } from "../../domain/entities/role.entity"
import { RoleError } from "../../domain/errors/role.error"
import { CreateRoleParams } from "../../domain/params/create-role.params"
import { UpdateRoleParams } from "../../domain/params/update-role.params"

export const ROLES_CATALOG_TTL_MS = 120000
const initialState = {
  roles: [] as Role[],
  _pendingReads: 0,
  _pendingWrites: 0,
  loaded: false,
  refreshing: false,
  expires: 0,
  error: undefined as RoleError | undefined
}
export const RolesStore = signalStore(
  { providedIn: "root" },
  withState(initialState),
  withComputed(store => ({
    loading: computed(() => store._pendingReads() + store._pendingWrites() > 0)
  })),
  withMethods(
    (
      store,
      getRoles = inject(GetRolesUseCase),
      createRole = inject(CreateRoleUseCase),
      updateRole = inject(UpdateRoleByIdUseCase),
      deleteRole = inject(DeleteRoleByIdUseCase)
    ) => {
      const session = createSessionReadScope(() => {
        patchState(store, initialState)
        catalog.reset()
      })
      const normalizeError = (error: unknown) =>
        error instanceof RoleError ? error : new RoleError("UNEXPECTED")
      const catalog = createReadResource<Role[], RoleError>({
        state: {
          get: catalogState,
          update: update => {
            const current = catalogState()
            const value = { ...current, ...update(current) }
            patchState(store, {
              roles: value.data,
              loaded: value.loaded,
              _pendingReads: value.pendingReads,
              refreshing: value.refreshing,
              expires: value.expires,
              error: value.error
            })
          }
        },
        initialData: () => [],
        request: () => getRoles.execute(),
        normalizeError,
        ttl: ROLES_CATALOG_TTL_MS,
        scope: session
      })
      function catalogState() {
        return {
          data: store.roles(),
          loaded: store.loaded(),
          pendingReads: store._pendingReads(),
          refreshing: store.refreshing(),
          expires: store.expires(),
          error: store.error()
        }
      }
      const execute = <T>(
        request: () => Observable<Result<T, RoleError>>,
        onSuccess: (data: T) => void
      ): Observable<Result<T, RoleError>> =>
        defer(() => {
          if (!session.check()) return EMPTY
          const generation = session.generation()
          patchState(store, state => ({
            _pendingWrites: state._pendingWrites + 1,
            error: undefined
          }))
          return defer(request).pipe(
            catchError((error: unknown) => of(Result.failure(normalizeError(error)))),
            tap(result => {
              if (generation !== session.generation()) return
              result.either(
                data => {
                  onSuccess(data)
                  patchState(store, { error: undefined })
                },
                error => patchState(store, { error })
              )
            }),
            takeUntil(session.cancelled$),
            finalize(() => {
              if (generation !== session.generation()) return
              patchState(store, state => ({ _pendingWrites: state._pendingWrites - 1 }))
            })
          )
        })
      const mutate = <T>(
        request: () => Observable<Result<T, RoleError>>,
        onSuccess: (data: T) => void
      ) =>
        defer(() => {
          if (!session.check()) return EMPTY
          catalog.invalidate()
          return execute(request, data => {
            // Also fence reads started during the dispatched mutation.
            catalog.invalidate()
            onSuccess(data)
          })
        })
      return {
        loadRoles(force = false) {
          return catalog.read(force)
        },
        createRole(params: CreateRoleParams) {
          return mutate(
            () => createRole.execute(params),
            role => {
              patchState(store, state => ({
                roles: [...state.roles.filter(r => r.id !== role.id), role]
              }))
            }
          )
        },
        updateRoleById(id: number, params: UpdateRoleParams) {
          return mutate(
            () => updateRole.execute(id, params),
            role => {
              patchState(store, state => ({
                roles: state.roles.map(r => (r.id === id ? role : r))
              }))
            }
          )
        },
        deleteRoleById(id: number) {
          return mutate(
            () => deleteRole.execute(id),
            () => {
              patchState(store, state => ({ roles: state.roles.filter(r => r.id !== id) }))
            }
          )
        }
      }
    }
  )
)
