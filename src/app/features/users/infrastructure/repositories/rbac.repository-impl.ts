import { inject, Injectable } from "@angular/core"
import { RbacRepository } from "../../domain/repositories/rbac.repository"
import { RbacGrant } from "../../domain/models/rbac-matrix"
import { RbacInMemorySource } from "../source/rbac-in-memory.source"
@Injectable({ providedIn: "root" })
export class RbacRepositoryImpl implements RbacRepository {
  private readonly source = inject(RbacInMemorySource)
  getRolePermissions(roleId: number) {
    return this.source.getRolePermissions(roleId)
  }
  saveRolePermissions(roleId: number, grants: readonly RbacGrant[]) {
    return this.source.saveRolePermissions(roleId, grants)
  }
}
