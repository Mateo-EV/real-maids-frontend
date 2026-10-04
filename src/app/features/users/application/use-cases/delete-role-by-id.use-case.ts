import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { RoleError } from "../../domain/errors/role.error"
import { ROLE_REPOSITORY } from "../../domain/repositories/role.repository"

@Injectable({ providedIn: "root" })
export class DeleteRoleByIdUseCase {
  private readonly repository = inject(ROLE_REPOSITORY)
  execute(id: number): Observable<Result<void, RoleError>> {
    return this.repository.deleteRoleById(id)
  }
}
