import { inject, Injectable } from "@angular/core"
import { FIELD_OPERATIONS_REPOSITORY } from "../../domain/repositories/field-operations.repository"
import {
  CreateFieldStaffParams,
  FieldStaffQuery,
  UpdateFieldStaffParams
} from "../../domain/params/field-operations.params"

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

/**
 * Employee creation, including the access account it may create in the same write (`createAccount`
 * plus `password`). There is no linking counterpart: the staff account is created with the record.
 */
@Injectable({ providedIn: "root" })
export class CreateFieldStaffUseCase {
  private readonly repository = inject(FIELD_OPERATIONS_REPOSITORY)
  execute(params: CreateFieldStaffParams) {
    return this.repository.createStaff(params)
  }
}

@Injectable({ providedIn: "root" })
export class UpdateFieldStaffUseCase {
  private readonly repository = inject(FIELD_OPERATIONS_REPOSITORY)
  execute(id: number, params: UpdateFieldStaffParams) {
    return this.repository.updateStaff(id, params)
  }
}
