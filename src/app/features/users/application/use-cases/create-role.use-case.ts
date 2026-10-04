import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Role } from "../../domain/entities/role.entity"
import { RoleError } from "../../domain/errors/role.error"
import { CreateRoleParams } from "../../domain/params/create-role.params"
import { ROLE_REPOSITORY } from "../../domain/repositories/role.repository"

@Injectable({ providedIn: "root" })
export class CreateRoleUseCase {
  private readonly repository = inject(ROLE_REPOSITORY)
  execute(params: CreateRoleParams): Observable<Result<Role, RoleError>> {
    return this.repository.createRole(params)
  }
}
