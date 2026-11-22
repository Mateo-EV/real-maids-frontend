import { inject, Injectable } from "@angular/core"
import { of } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import {
  CreateFieldStaffParams,
  FieldStaffQuery,
  UpdateFieldStaffParams
} from "../../domain/params/field-operations.params"
import { FieldOperationsRepository } from "../../domain/repositories/field-operations.repository"
import { FieldStaffHttpSource } from "../source/field-staff-http.source"
import { failure } from "../source/field-staff-http.validation"

const unsupported = () => of(Result.failure(failure("UNSUPPORTED")))

@Injectable({ providedIn: "root" })
export class FieldOperationsRepositoryImpl implements FieldOperationsRepository {
  private readonly source = inject(FieldStaffHttpSource)
  getStaff(query: FieldStaffQuery = {}) {
    return this.source.getStaff(query)
  }
  getStaffById(id: number) {
    return this.source.getStaffById(id)
  }
  getMyStaffProfile() {
    return this.source.getMyStaffProfile()
  }
  // The employee editor owns its write path: the account is created or retired with the record.
  createStaff(params: CreateFieldStaffParams) {
    return this.source.createStaff(params)
  }
  updateStaff(id: number, params: UpdateFieldStaffParams) {
    return this.source.updateStaff(id, params)
  }

  // Status and availability remain deliberately unwired in this slice.
  setStaffStatus: FieldOperationsRepository["setStaffStatus"] = unsupported
  replaceAvailability: FieldOperationsRepository["replaceAvailability"] = unsupported
  // Domain proposals do not establish endpoints or an upload protocol.
  getCrews: FieldOperationsRepository["getCrews"] = unsupported
  getCrew: FieldOperationsRepository["getCrew"] = unsupported
  createCrew: FieldOperationsRepository["createCrew"] = unsupported
  updateCrew: FieldOperationsRepository["updateCrew"] = unsupported
  getCrewMembers: FieldOperationsRepository["getCrewMembers"] = unsupported
  createCrewMember: FieldOperationsRepository["createCrewMember"] = unsupported
  updateCrewMember: FieldOperationsRepository["updateCrewMember"] = unsupported
  getWorkLogs: FieldOperationsRepository["getWorkLogs"] = unsupported
  createWorkLog: FieldOperationsRepository["createWorkLog"] = unsupported
  updateWorkLog: FieldOperationsRepository["updateWorkLog"] = unsupported
  getChecklist: FieldOperationsRepository["getChecklist"] = unsupported
  createChecklistItem: FieldOperationsRepository["createChecklistItem"] = unsupported
  updateChecklistItem: FieldOperationsRepository["updateChecklistItem"] = unsupported
  getEvidence: FieldOperationsRepository["getEvidence"] = unsupported
  createEvidence: FieldOperationsRepository["createEvidence"] = unsupported
  updateEvidence: FieldOperationsRepository["updateEvidence"] = unsupported
}
