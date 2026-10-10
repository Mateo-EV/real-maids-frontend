import { inject, Injectable } from "@angular/core"
import { catchError, map, Observable, of, switchMap, timer } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { RbacError } from "../../domain/errors/rbac.error"
import {
  copyRbacMatrix,
  RBAC_ACTIONS,
  RBAC_MODULES,
  RbacGrant,
  RbacMatrix
} from "../../domain/models/rbac-matrix"
import { RoleInMemorySource } from "./role-in-memory.source"

@Injectable({ providedIn: "root" })
export class RbacInMemorySource {
  private readonly roles = inject(RoleInMemorySource)
  // FICTITIOUS DEMO DATA: existing role 2 is named Operaciones in RoleInMemorySource.
  // Seed only grants explicitly checked in the approved HTML. This does not authorize requests.
  private readonly matrices = new Map<number, RbacMatrix>([
    [
      2,
      {
        roleId: 2,
        configured: true,
        grants: RBAC_MODULES.flatMap(module =>
          RBAC_ACTIONS.filter(action => {
            if (module.id === "configuration") return false
            if (module.id === "landing" || module.id === "billing") return action.id === "read"
            return module.id === "scheduling" || action.id !== "delete"
          }).map(action => ({ module: module.id, action: action.id }))
        )
      }
    ]
  ])

  private execute(
    roleId: number,
    operation: () => Result<RbacMatrix, RbacError>
  ): Observable<Result<RbacMatrix, RbacError>> {
    // Role lookup and all validation/effects happen only after cancellable latency.
    return timer(250).pipe(
      switchMap(() => this.roles.getRoleById(roleId)),
      map(role =>
        role.success
          ? operation()
          : Result.failure(
              new RbacError(role.error.code === "ROLE_NOT_FOUND" ? "ROLE_NOT_FOUND" : "UNEXPECTED")
            )
      ),
      catchError(() => of(Result.failure(new RbacError("UNEXPECTED"))))
    )
  }
  getRolePermissions(roleId: number): Observable<Result<RbacMatrix, RbacError>> {
    return this.execute(roleId, () =>
      Result.success(
        copyRbacMatrix(this.matrices.get(roleId) ?? { roleId, configured: false, grants: [] })
      )
    )
  }
  saveRolePermissions(
    roleId: number,
    grants: readonly RbacGrant[]
  ): Observable<Result<RbacMatrix, RbacError>> {
    // Snapshot caller input without retaining references; malformed runtime input fails after delay.
    const input: unknown = Array.isArray(grants)
      ? grants.map(g => g && { module: g.module, action: g.action })
      : null
    return this.execute(roleId, () => {
      if (!this.validGrants(input)) return Result.failure(new RbacError("INVALID_GRANTS"))
      const matrix: RbacMatrix = { roleId, configured: true, grants: input }
      this.matrices.set(roleId, copyRbacMatrix(matrix))
      return Result.success(copyRbacMatrix(matrix))
    })
  }
  private validGrants(value: unknown): value is RbacGrant[] {
    if (!Array.isArray(value)) return false
    const keys = new Set<string>()
    return value.every((grant: unknown) => {
      if (!grant || typeof grant !== "object" || !("module" in grant) || !("action" in grant))
        return false
      if (
        !RBAC_MODULES.some(m => m.id === grant.module) ||
        !RBAC_ACTIONS.some(a => a.id === grant.action)
      )
        return false
      const key = `${grant.module}:${grant.action}`
      if (keys.has(key)) return false
      keys.add(key)
      return true
    })
  }
}
