import { inject, Injectable } from "@angular/core"
import { RBAC_REPOSITORY } from "../../domain/repositories/rbac.repository"
import { RbacGrant } from "../../domain/models/rbac-matrix"
@Injectable({ providedIn: "root" })
export class SaveRolePermissionsUseCase {
  private readonly repository = inject(RBAC_REPOSITORY)
  execute(roleId: number, grants: readonly RbacGrant[]) {
    return this.repository.saveRolePermissions(roleId, grants)
  }
}
