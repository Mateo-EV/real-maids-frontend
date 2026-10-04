import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Role } from "../../domain/entities/role.entity"
import { RoleError } from "../../domain/errors/role.error"
import { UpdateRoleParams } from "../../domain/params/update-role.params"
import { ROLE_REPOSITORY } from "../../domain/repositories/role.repository"

@Injectable({ providedIn: "root" })
export class UpdateRoleByIdUseCase {
  private readonly repository = inject(ROLE_REPOSITORY)
  execute(id: number, params: UpdateRoleParams): Observable<Result<Role, RoleError>> {
    return this.repository.updateRoleById(id, params)
  }
}
