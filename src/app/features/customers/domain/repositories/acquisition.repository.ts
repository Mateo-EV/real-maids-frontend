import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Customer } from "../entities/customer.entity"
import { LeadOrigin } from "../entities/lead-origin.entity"
import { FunnelStage } from "../entities/funnel-stage.entity"
import { Lead } from "../entities/lead.entity"
import { LeadFollowUp } from "../entities/lead-follow-up.entity"
import { CustomerError } from "../errors/customer.error"
import {
  CreateLeadOriginParams,
  UpdateLeadOriginParams,
  CreateFunnelStageParams,
  UpdateFunnelStageParams,
  CreateLeadParams,
  UpdateLeadParams,
  CreateLeadFollowUpParams,
  ConvertLeadParams
} from "../params/acquisition.params"

/** Confirmed acquisition actions; no inferred funnel transitions. */
export interface AcquisitionRepository {
  convertLead(params: ConvertLeadParams): Observable<Result<Customer, CustomerError>>
  listOrigins(): Observable<Result<readonly LeadOrigin[], CustomerError>>
  createOrigin(params: CreateLeadOriginParams): Observable<Result<LeadOrigin, CustomerError>>
  updateOrigin(params: UpdateLeadOriginParams): Observable<Result<LeadOrigin, CustomerError>>
  listStages(): Observable<Result<readonly FunnelStage[], CustomerError>>
  createStage(params: CreateFunnelStageParams): Observable<Result<FunnelStage, CustomerError>>
  updateStage(params: UpdateFunnelStageParams): Observable<Result<FunnelStage, CustomerError>>
  listLeads(params: PaginationParams): Observable<Result<PaginationResponse<Lead>, CustomerError>>
  findLead(id: number): Observable<Result<Lead, CustomerError>>
  createLead(params: CreateLeadParams): Observable<Result<Lead, CustomerError>>
  updateLead(params: UpdateLeadParams): Observable<Result<Lead, CustomerError>>
  listFollowUps(leadId: number): Observable<Result<readonly LeadFollowUp[], CustomerError>>
  addFollowUp(params: CreateLeadFollowUpParams): Observable<Result<LeadFollowUp, CustomerError>>
}
export const ACQUISITION_REPOSITORY = new InjectionToken<AcquisitionRepository>(
  "acquisition.repository"
)
