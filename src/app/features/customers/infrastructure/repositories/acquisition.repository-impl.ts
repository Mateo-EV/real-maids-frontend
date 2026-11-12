import { CheckLeadEmailParams } from "../../domain/params/lead-email.params"
import { inject, Injectable } from "@angular/core"
import { LeadListQuery } from "../../domain/models/lead-list-query"
import { AcquisitionRepository } from "../../domain/repositories/acquisition.repository"
import {
  CreateLeadOriginParams,
  UpdateLeadOriginParams,
  CreateFunnelStageParams,
  UpdateFunnelStageParams,
  CreateLeadParams,
  UpdateLeadParams,
  CreateLeadFollowUpParams,
  ConvertLeadParams
} from "../../domain/params/acquisition.params"
import { AcquisitionHttpSource } from "../source/acquisition-http.source"

@Injectable({ providedIn: "root" })
export class AcquisitionRepositoryImpl implements AcquisitionRepository {
  private readonly source = inject(AcquisitionHttpSource)
  checkLeadEmail(params: CheckLeadEmailParams) {
    return this.source.checkLeadEmail(params)
  }
  listOrigins() {
    return this.source.listOrigins()
  }
  createOrigin(params: CreateLeadOriginParams) {
    return this.source.createOrigin(params)
  }
  updateOrigin(params: UpdateLeadOriginParams) {
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
  listLeads(params: LeadListQuery) {
    return this.source.listLeads(params)
  }
  getLeadStatistics() {
    return this.source.getLeadStatistics()
  }
  findLead(id: number) {
    return this.source.findLead(id)
  }
  createLead(params: CreateLeadParams) {
    return this.source.createLead(params)
  }
  updateLead(params: UpdateLeadParams) {
    return this.source.updateLead(params)
  }
  deleteLead(id: number) {
    return this.source.deleteLead(id)
  }
  listFollowUps(leadId: number) {
    return this.source.listFollowUps(leadId)
  }
  addFollowUp(params: CreateLeadFollowUpParams) {
    return this.source.addFollowUp(params)
  }
  convertLead(params: ConvertLeadParams) {
    return this.source.convertLead(params)
  }
}
