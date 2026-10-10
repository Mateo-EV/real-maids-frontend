import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { RbacGrant, RbacMatrix } from "../models/rbac-matrix"
import { RbacError } from "../errors/rbac.error"
export interface RbacRepository {
  getRolePermissions(roleId: number): Observable<Result<RbacMatrix, RbacError>>
  saveRolePermissions(
    roleId: number,
    grants: readonly RbacGrant[]
  ): Observable<Result<RbacMatrix, RbacError>>
}
export const RBAC_REPOSITORY = new InjectionToken<RbacRepository>("RBAC_REPOSITORY")
