import { inject, Injectable } from "@angular/core"
import { RBAC_REPOSITORY } from "../../domain/repositories/rbac.repository"
@Injectable({ providedIn: "root" })
export class SaveRolePermissionsUseCase {
  private readonly repository = inject(RBAC_REPOSITORY)
  execute(roleId: number, ids: readonly number[]) {
    return this.repository.saveRolePermissions(roleId, ids)
  }
}
