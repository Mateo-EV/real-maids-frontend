import { inject, Injectable } from "@angular/core"
import { FIELD_OPERATIONS_REPOSITORY } from "../../domain/repositories/field-operations.repository"
import { FieldStaffQuery } from "../../domain/params/field-operations.params"

@Injectable({ providedIn: "root" })
export class GetFieldStaffUseCase {
  private readonly repository = inject(FIELD_OPERATIONS_REPOSITORY)
  execute(query: FieldStaffQuery = {}) {
    return this.repository.getStaff(query)
  }
}

@Injectable({ providedIn: "root" })
export class GetFieldStaffByIdUseCase {
  private readonly repository = inject(FIELD_OPERATIONS_REPOSITORY)
  execute(id: number) {
    return this.repository.getStaffById(id)
  }
}

@Injectable({ providedIn: "root" })
export class GetMyStaffProfileUseCase {
  private readonly repository = inject(FIELD_OPERATIONS_REPOSITORY)
  execute() {
    return this.repository.getMyStaffProfile()
  }
}
