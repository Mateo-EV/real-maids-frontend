import { inject, Injectable } from "@angular/core"
import { CreateRoleParams } from "../../domain/params/create-role.params"
import { UpdateRoleParams } from "../../domain/params/update-role.params"
import { RoleRepository } from "../../domain/repositories/role.repository"
import { RoleHttpSource } from "../source/role-http.source"

@Injectable({ providedIn: "root" })
export class RoleRepositoryImpl implements RoleRepository {
  private readonly source = inject(RoleHttpSource)

  createRole(params: CreateRoleParams) {
    return this.source.createRole(params)
  }

  getRoles() {
    return this.source.getRoles()
  }

  getRoleById(id: number) {
    return this.source.getRoleById(id)
  }

  updateRoleById(id: number, params: UpdateRoleParams) {
    return this.source.updateRoleById(id, params)
  }

  deleteRoleById(id: number) {
    return this.source.deleteRoleById(id)
  }
}
