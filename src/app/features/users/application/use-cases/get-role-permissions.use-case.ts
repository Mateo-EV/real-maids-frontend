import { inject, Injectable } from "@angular/core"
import { RBAC_REPOSITORY } from "../../domain/repositories/rbac.repository"
@Injectable({ providedIn: "root" })
export class GetRolePermissionsUseCase {
  private readonly repository = inject(RBAC_REPOSITORY)
  execute(roleId: number) {
    return this.repository.getRolePermissions(roleId)
  }
}
