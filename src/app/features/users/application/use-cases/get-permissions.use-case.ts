import { inject, Injectable } from "@angular/core"
import { RBAC_REPOSITORY } from "../../domain/repositories/rbac.repository"
@Injectable({ providedIn: "root" })
export class GetPermissionsUseCase {
  private readonly repository = inject(RBAC_REPOSITORY)
  execute() {
    return this.repository.getPermissions()
  }
}
