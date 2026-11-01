import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { ProspectOrigin } from "../entities/prospect-origin.entity"
import { FunnelStage } from "../entities/funnel-stage.entity"
import { Prospect } from "../entities/prospect.entity"
import { ProspectFollowUp } from "../entities/prospect-follow-up.entity"
import { CustomerError } from "../errors/customer.error"
import {
  CreateProspectOriginParams,
  UpdateProspectOriginParams,
  CreateFunnelStageParams,
  UpdateFunnelStageParams,
  CreateProspectParams,
  UpdateProspectParams,
  CreateProspectFollowUpParams
} from "../params/acquisition.params"

/** Proposed acquisition aggregate, without guessed conversions or stage transition rules. */
export interface AcquisitionRepository {
  listOrigins(): Observable<Result<readonly ProspectOrigin[], CustomerError>>
  createOrigin(
    params: CreateProspectOriginParams
  ): Observable<Result<ProspectOrigin, CustomerError>>
  updateOrigin(
    params: UpdateProspectOriginParams
  ): Observable<Result<ProspectOrigin, CustomerError>>
  listStages(): Observable<Result<readonly FunnelStage[], CustomerError>>
  createStage(params: CreateFunnelStageParams): Observable<Result<FunnelStage, CustomerError>>
  updateStage(params: UpdateFunnelStageParams): Observable<Result<FunnelStage, CustomerError>>
  listProspects(
    params: PaginationParams
  ): Observable<Result<PaginationResponse<Prospect>, CustomerError>>
  findProspect(id: number): Observable<Result<Prospect, CustomerError>>
  createProspect(params: CreateProspectParams): Observable<Result<Prospect, CustomerError>>
  updateProspect(params: UpdateProspectParams): Observable<Result<Prospect, CustomerError>>
  listFollowUps(prospectId: number): Observable<Result<readonly ProspectFollowUp[], CustomerError>>
  addFollowUp(
    params: CreateProspectFollowUpParams
  ): Observable<Result<ProspectFollowUp, CustomerError>>
}
export const ACQUISITION_REPOSITORY = new InjectionToken<AcquisitionRepository>(
  "acquisition.repository"
)
