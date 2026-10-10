import { inject } from "@angular/core"
import { patchState, signalStore, withMethods, withState } from "@ngrx/signals"
import { catchError, defer, finalize, Observable, of, tap } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { GetRolePermissionsUseCase } from "../../application/use-cases/get-role-permissions.use-case"
import { SaveRolePermissionsUseCase } from "../../application/use-cases/save-role-permissions.use-case"
import { copyRbacMatrix, RbacGrant, RbacMatrix } from "../../domain/models/rbac-matrix"
import { RbacError } from "../../domain/errors/rbac.error"

export const RbacStore = signalStore(
  { providedIn: "root" },
  withState({ matrices: {} as Record<number, RbacMatrix>, loading: false }),
  withMethods(
    (
      store,
      query = inject(GetRolePermissionsUseCase),
      save = inject(SaveRolePermissionsUseCase)
    ) => {
      let pending = 0
      const revisions = new Map<number, number>()
      const loads = new Map<number, number>()
      const execute = (
        request: () => Observable<Result<RbacMatrix, RbacError>>,
        current: () => boolean,
        saved = false
      ) =>
        defer(() => {
          pending++
          patchState(store, { loading: true })
          return defer(request).pipe(
            catchError(() => of(Result.failure(new RbacError("UNEXPECTED")))),
            tap(result => {
              if (!result.success || !current()) return
              const matrix = copyRbacMatrix(result.data)
              if (saved) revisions.set(matrix.roleId, (revisions.get(matrix.roleId) ?? 0) + 1)
              patchState(store, state => ({
                matrices: { ...state.matrices, [matrix.roleId]: matrix }
              }))
            }),
            finalize(() => {
              pending--
              patchState(store, { loading: pending > 0 })
            })
          )
        })
      return {
        loadPermissions(roleId: number) {
          return defer(() => {
            const id = (loads.get(roleId) ?? 0) + 1
            loads.set(roleId, id)
            const revision = revisions.get(roleId) ?? 0
            return execute(
              () => query.execute(roleId),
              () => loads.get(roleId) === id && (revisions.get(roleId) ?? 0) === revision
            )
          })
        },
        savePermissions(roleId: number, grants: readonly RbacGrant[]) {
          const snapshot = grants.map(g => ({ ...g }))
          return execute(
            () => save.execute(roleId, snapshot),
            () => true,
            true
          )
        }
      }
    }
  )
)
