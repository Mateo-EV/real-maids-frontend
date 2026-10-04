import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Role } from "../entities/role.entity"
import { RoleError } from "../errors/role.error"
import { CreateRoleParams } from "../params/create-role.params"
import { UpdateRoleParams } from "../params/update-role.params"

export interface RoleRepository {
  createRole(params: CreateRoleParams): Observable<Result<Role, RoleError>>
  getRoleById(id: number): Observable<Result<Role, RoleError>>
  getRoles(): Observable<Result<Role[], RoleError>>
  updateRoleById(id: number, params: UpdateRoleParams): Observable<Result<Role, RoleError>>
  deleteRoleById(id: number): Observable<Result<void, RoleError>>
}

export const ROLE_REPOSITORY = new InjectionToken<RoleRepository>("role.repository")
