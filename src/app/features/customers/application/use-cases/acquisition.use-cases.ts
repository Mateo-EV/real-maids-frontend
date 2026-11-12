import { CheckLeadEmailParams } from "../../domain/params/lead-email.params"
import { inject, Injectable } from "@angular/core"
import { LeadListQuery } from "../../domain/models/lead-list-query"
import { ACQUISITION_REPOSITORY } from "../../domain/repositories/acquisition.repository"
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

@Injectable({ providedIn: "root" })
export class CheckLeadEmailUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: CheckLeadEmailParams) {
    return this.repository.checkLeadEmail(params)
  }
}
@Injectable({ providedIn: "root" })
export class ListLeadOriginsUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute() {
    return this.repository.listOrigins()
  }
}
@Injectable({ providedIn: "root" })
export class CreateLeadOriginUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: CreateLeadOriginParams) {
    return this.repository.createOrigin(params)
  }
}
@Injectable({ providedIn: "root" })
export class UpdateLeadOriginUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: UpdateLeadOriginParams) {
    return this.repository.updateOrigin(params)
  }
}
@Injectable({ providedIn: "root" })
export class ListFunnelStagesUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute() {
    return this.repository.listStages()
  }
}
@Injectable({ providedIn: "root" })
export class CreateFunnelStageUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: CreateFunnelStageParams) {
    return this.repository.createStage(params)
  }
}
@Injectable({ providedIn: "root" })
export class UpdateFunnelStageUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: UpdateFunnelStageParams) {
    return this.repository.updateStage(params)
  }
}
@Injectable({ providedIn: "root" })
export class ListLeadsUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: LeadListQuery = {}) {
    return this.repository.listLeads(params)
  }
}
@Injectable({ providedIn: "root" })
export class GetLeadUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(id: number) {
    return this.repository.findLead(id)
  }
}
@Injectable({ providedIn: "root" })
export class CreateLeadUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: CreateLeadParams) {
    return this.repository.createLead(params)
  }
}
@Injectable({ providedIn: "root" })
export class UpdateLeadUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: UpdateLeadParams) {
    return this.repository.updateLead(params)
  }
}
@Injectable({ providedIn: "root" })
export class ListLeadFollowUpsUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(leadId: number) {
    return this.repository.listFollowUps(leadId)
  }
}
@Injectable({ providedIn: "root" })
export class AddLeadFollowUpUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: CreateLeadFollowUpParams) {
    return this.repository.addFollowUp(params)
  }
}
@Injectable({ providedIn: "root" })
export class ConvertLeadUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: ConvertLeadParams) {
    return this.repository.convertLead(params)
  }
}
