import { inject } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, finalize, map, Observable, of, tap } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { GetPermissionsUseCase } from "../../application/use-cases/get-permissions.use-case"
import { GetRolePermissionsUseCase } from "../../application/use-cases/get-role-permissions.use-case"
import { SaveRolePermissionsUseCase } from "../../application/use-cases/save-role-permissions.use-case"
import {
  Permission,
  PermissionAssignment,
  copyAssignment
} from "../../domain/entities/permission.entity"
import { RbacGrant, RbacMatrix } from "../../domain/models/rbac-matrix"
import { RbacError } from "../../domain/errors/rbac.error"
export const RbacStore = signalStore(
  { providedIn: "root" },
  withState({
    matrices: {} as Record<number, PermissionAssignment>,
    catalog: [] as Permission[],
    loading: false
  }),
  withMethods(
    (
      store,
      query = inject(GetRolePermissionsUseCase),
      save = inject(SaveRolePermissionsUseCase),
      catalog = inject(GetPermissionsUseCase)
    ) => {
      let pending = 0,
        catalogGeneration = 0
      const revisions = new Map<number, number>(),
        loads = new Map<number, number>(),
        writes = new Set<number>()
      function execute<T>(
        request: () => Observable<Result<T, RbacError>>,
        update: (value: T) => void
      ) {
        return defer(() => {
          pending++
          patchState(store, { loading: true })
          return defer(request).pipe(
            catchError(() => of(Result.failure(new RbacError("UNEXPECTED")))),
            tap(result => {
              if (result.success) update(result.data)
            }),
            finalize(() => {
              pending--
              patchState(store, { loading: pending > 0 })
            })
          )
        })
      }
      return {
        loadCatalog() {
          return defer(() => {
            const generation = ++catalogGeneration
            return execute(
              () => catalog.execute(),
              value => {
                if (generation === catalogGeneration)
                  patchState(store, { catalog: value.map(p => ({ ...p })) })
              }
            )
          })
        },
        loadPermissions(roleId: number) {
          return defer(() => {
            const id = (loads.get(roleId) ?? 0) + 1,
              revision = revisions.get(roleId) ?? 0
            loads.set(roleId, id)
            return execute(
              () =>
                query
                  .execute(roleId)
                  .pipe(
                    map(result =>
                      result.success && result.data.roleId !== roleId
                        ? Result.failure(new RbacError("INVALID_RESPONSE"))
                        : result
                    )
                  ),
              matrix => {
                if (
                  matrix.roleId !== roleId ||
                  loads.get(roleId) !== id ||
                  (revisions.get(roleId) ?? 0) !== revision
                )
                  return
                patchState(store, state => ({
                  matrices: { ...state.matrices, [roleId]: copyAssignment(matrix) }
                }))
              }
            )
          })
        },
        savePermissionIds(roleId: number, ids: readonly number[]) {
          const snapshot = [...ids]
          return defer(() => {
            if (writes.has(roleId)) return of(Result.failure(new RbacError("BUSY")))
            writes.add(roleId)
            return execute(
              () =>
                save
                  .execute(roleId, snapshot)
                  .pipe(
                    map(result =>
                      result.success && result.data.roleId !== roleId
                        ? Result.failure(new RbacError("INVALID_RESPONSE"))
                        : result
                    )
                  ),
              matrix => {
                if (matrix.roleId !== roleId) return
                revisions.set(roleId, (revisions.get(roleId) ?? 0) + 1)
                patchState(store, state => ({
                  matrices: { ...state.matrices, [roleId]: copyAssignment(matrix) }
                }))
              }
            ).pipe(finalize(() => writes.delete(roleId)))
          })
        },
        // Compatibility for the unwired legacy illustration dialog: never dispatch its grants.
        savePermissions(
          _roleId: number,
          _grants: readonly RbacGrant[]
        ): Observable<Result<RbacMatrix, RbacError>> {
          return of(Result.failure(new RbacError("UNSUPPORTED")))
        }
      }
    }
  )
)
