import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { Crew } from "../entities/crew.entity"
import { CrewMember } from "../entities/crew-member.entity"
import { ServiceChecklist } from "../entities/service-checklist.entity"
import { ServiceEvidence } from "../entities/service-evidence.entity"
import { WorkLog } from "../entities/work-log.entity"
import { FieldOperationsError } from "../errors/field-operations.error"
import { FieldStaffSummary } from "../models/field-staff-summary"
import {
  CreateCrewMemberParams,
  CreateCrewParams,
  CreateFieldStaffParams,
  CreateServiceChecklistParams,
  CreateServiceEvidenceParams,
  CreateWorkLogParams,
  CrewQuery,
  FieldStaffQuery,
  LinkStaffAccountParams,
  ReplaceStaffAvailabilityParams,
  SetFieldStaffStatusParams,
  UpdateCrewMemberParams,
  UpdateCrewParams,
  UpdateFieldStaffParams,
  UpdateServiceChecklistParams,
  UpdateServiceEvidenceParams,
  UpdateWorkLogParams
} from "../params/field-operations.params"

export interface FieldOperationsRepository {
  // Confirmed PersonalController operations, including whole availability replacement.
  getStaff(
    query: FieldStaffQuery
  ): Observable<Result<PaginationResponse<FieldStaffSummary>, FieldOperationsError>>
  getStaffById(id: number): Observable<Result<FieldStaffSummary, FieldOperationsError>>
  getMyStaffProfile(): Observable<Result<FieldStaffSummary, FieldOperationsError>>
  createStaff(
    params: CreateFieldStaffParams
  ): Observable<Result<FieldStaffSummary, FieldOperationsError>>
  updateStaff(
    id: number,
    params: UpdateFieldStaffParams
  ): Observable<Result<FieldStaffSummary, FieldOperationsError>>
  setStaffStatus(
    id: number,
    params: SetFieldStaffStatusParams
  ): Observable<Result<FieldStaffSummary, FieldOperationsError>>
  linkStaffAccount(
    id: number,
    params: LinkStaffAccountParams
  ): Observable<Result<FieldStaffSummary, FieldOperationsError>>
  replaceAvailability(
    id: number,
    params: ReplaceStaffAvailabilityParams
  ): Observable<Result<FieldStaffSummary, FieldOperationsError>>

  // Proposed crew/execution capabilities; no HTTP implementation or upload protocol.
  getCrews(query: CrewQuery): Observable<Result<PaginationResponse<Crew>, FieldOperationsError>>
  getCrew(id: number): Observable<Result<Crew, FieldOperationsError>>
  createCrew(params: CreateCrewParams): Observable<Result<Crew, FieldOperationsError>>
  updateCrew(id: number, params: UpdateCrewParams): Observable<Result<Crew, FieldOperationsError>>
  getCrewMembers(crewId: number): Observable<Result<CrewMember[], FieldOperationsError>>
  createCrewMember(
    crewId: number,
    params: CreateCrewMemberParams
  ): Observable<Result<CrewMember, FieldOperationsError>>
  updateCrewMember(
    crewId: number,
    id: number,
    params: UpdateCrewMemberParams
  ): Observable<Result<CrewMember, FieldOperationsError>>
  getWorkLogs(orderId: number): Observable<Result<WorkLog[], FieldOperationsError>>
  createWorkLog(
    orderId: number,
    params: CreateWorkLogParams
  ): Observable<Result<WorkLog, FieldOperationsError>>
  updateWorkLog(
    orderId: number,
    id: number,
    params: UpdateWorkLogParams
  ): Observable<Result<WorkLog, FieldOperationsError>>
  getChecklist(orderId: number): Observable<Result<ServiceChecklist[], FieldOperationsError>>
  createChecklistItem(
    orderId: number,
    params: CreateServiceChecklistParams
  ): Observable<Result<ServiceChecklist, FieldOperationsError>>
  updateChecklistItem(
    orderId: number,
    id: number,
    params: UpdateServiceChecklistParams
  ): Observable<Result<ServiceChecklist, FieldOperationsError>>
  getEvidence(orderId: number): Observable<Result<ServiceEvidence[], FieldOperationsError>>
  createEvidence(
    orderId: number,
    params: CreateServiceEvidenceParams
  ): Observable<Result<ServiceEvidence, FieldOperationsError>>
  updateEvidence(
    orderId: number,
    id: number,
    params: UpdateServiceEvidenceParams
  ): Observable<Result<ServiceEvidence, FieldOperationsError>>
}

export const FIELD_OPERATIONS_REPOSITORY = new InjectionToken<FieldOperationsRepository>(
  "field-operations.repository"
)
