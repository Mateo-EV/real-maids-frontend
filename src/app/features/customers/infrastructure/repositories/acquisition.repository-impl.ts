import { inject, Injectable } from "@angular/core"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { AcquisitionRepository } from "../../domain/repositories/acquisition.repository"
import {
  CreateProspectOriginParams,
  UpdateProspectOriginParams,
  CreateFunnelStageParams,
  UpdateFunnelStageParams,
  CreateProspectParams,
  UpdateProspectParams,
  CreateProspectFollowUpParams,
  ConvertProspectParams
} from "../../domain/params/acquisition.params"
import { AcquisitionHttpSource } from "../source/acquisition-http.source"

@Injectable({ providedIn: "root" })
export class AcquisitionRepositoryImpl implements AcquisitionRepository {
  private readonly source = inject(AcquisitionHttpSource)
  listOrigins() {
    return this.source.listOrigins()
  }
  createOrigin(params: CreateProspectOriginParams) {
    return this.source.createOrigin(params)
  }
  updateOrigin(params: UpdateProspectOriginParams) {
    return this.source.updateOrigin(params)
  }
  listStages() {
    return this.source.listStages()
  }
  createStage(params: CreateFunnelStageParams) {
    return this.source.createStage(params)
  }
  updateStage(params: UpdateFunnelStageParams) {
    return this.source.updateStage(params)
  }
  listProspects(params: PaginationParams) {
    return this.source.listProspects(params)
  }
  findProspect(id: number) {
    return this.source.findProspect(id)
  }
  createProspect(params: CreateProspectParams) {
    return this.source.createProspect(params)
  }
  updateProspect(params: UpdateProspectParams) {
    return this.source.updateProspect(params)
  }
  listFollowUps(prospectId: number) {
    return this.source.listFollowUps(prospectId)
  }
  addFollowUp(params: CreateProspectFollowUpParams) {
    return this.source.addFollowUp(params)
  }
  convertProspect(params: ConvertProspectParams) {
    return this.source.convertProspect(params)
  }
}
