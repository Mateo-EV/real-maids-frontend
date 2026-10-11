import { inject, Injectable } from "@angular/core"
import { RbacRepository } from "../../domain/repositories/rbac.repository"
import { RbacHttpSource } from "../source/rbac-http.source"
@Injectable({ providedIn: "root" })
export class RbacRepositoryImpl implements RbacRepository {
  private readonly source = inject(RbacHttpSource)
  getPermissions() {
    return this.source.getPermissions()
  }
  getRolePermissions(roleId: number) {
    return this.source.getRolePermissions(roleId)
  }
  saveRolePermissions(roleId: number, ids: readonly number[]) {
    return this.source.saveRolePermissions(roleId, ids)
  }
}
