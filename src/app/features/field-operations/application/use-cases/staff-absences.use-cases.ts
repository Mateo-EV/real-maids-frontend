import { inject, Injectable } from "@angular/core"
import { FIELD_OPERATIONS_REPOSITORY } from "../../domain/repositories/field-operations.repository"
import {
  CreateStaffAbsenceParams,
  SetStaffAbsenceStatusParams,
  StaffAbsenceQuery
} from "../../domain/params/field-operations.params"

/** Stateless named actions of the absence contract; the backend keeps every transition rule. */
@Injectable({ providedIn: "root" })
export class ListStaffAbsencesUseCase {
  private readonly repository = inject(FIELD_OPERATIONS_REPOSITORY)
  execute(query: StaffAbsenceQuery = {}) {
    return this.repository.getAbsences(query)
  }
}

@Injectable({ providedIn: "root" })
export class GetStaffAbsenceByIdUseCase {
  private readonly repository = inject(FIELD_OPERATIONS_REPOSITORY)
  execute(id: number) {
    return this.repository.getAbsenceById(id)
  }
}

/** Own request: the caller's staff record is resolved by the backend, never sent by the client. */
@Injectable({ providedIn: "root" })
export class CreateStaffAbsenceUseCase {
  private readonly repository = inject(FIELD_OPERATIONS_REPOSITORY)
  execute(params: CreateStaffAbsenceParams) {
    return this.repository.createAbsence(params)
  }
}

/**
 * Resolution write shared by both audiences: the employee cancels a pending request and HR
 * approves, rejects or withdraws. Authorization and the allowed move stay server-owned.
 */
@Injectable({ providedIn: "root" })
export class SetStaffAbsenceStatusUseCase {
  private readonly repository = inject(FIELD_OPERATIONS_REPOSITORY)
  execute(id: number, params: SetStaffAbsenceStatusParams) {
    return this.repository.setAbsenceStatus(id, params)
  }
}
