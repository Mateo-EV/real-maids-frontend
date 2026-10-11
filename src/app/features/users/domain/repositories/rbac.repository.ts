import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Permission, PermissionAssignment } from "../entities/permission.entity"
import { RbacError } from "../errors/rbac.error"
export interface RbacRepository {
  getPermissions(): Observable<Result<Permission[], RbacError>>
  getRolePermissions(roleId: number): Observable<Result<PermissionAssignment, RbacError>>
  saveRolePermissions(
    roleId: number,
    ids: readonly number[]
  ): Observable<Result<PermissionAssignment, RbacError>>
}
export const RBAC_REPOSITORY = new InjectionToken<RbacRepository>("RBAC_REPOSITORY")
