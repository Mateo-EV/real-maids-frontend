import { inject, Injectable } from "@angular/core"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { ACQUISITION_REPOSITORY } from "../../domain/repositories/acquisition.repository"
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

@Injectable({ providedIn: "root" })
export class ListProspectOriginsUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute() {
    return this.repository.listOrigins()
  }
}
@Injectable({ providedIn: "root" })
export class CreateProspectOriginUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: CreateProspectOriginParams) {
    return this.repository.createOrigin(params)
  }
}
@Injectable({ providedIn: "root" })
export class UpdateProspectOriginUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: UpdateProspectOriginParams) {
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
export class ListProspectsUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: PaginationParams = {}) {
    return this.repository.listProspects(params)
  }
}
@Injectable({ providedIn: "root" })
export class GetProspectUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(id: number) {
    return this.repository.findProspect(id)
  }
}
@Injectable({ providedIn: "root" })
export class CreateProspectUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: CreateProspectParams) {
    return this.repository.createProspect(params)
  }
}
@Injectable({ providedIn: "root" })
export class UpdateProspectUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: UpdateProspectParams) {
    return this.repository.updateProspect(params)
  }
}
@Injectable({ providedIn: "root" })
export class ListProspectFollowUpsUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(prospectId: number) {
    return this.repository.listFollowUps(prospectId)
  }
}
@Injectable({ providedIn: "root" })
export class AddProspectFollowUpUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: CreateProspectFollowUpParams) {
    return this.repository.addFollowUp(params)
  }
}
@Injectable({ providedIn: "root" })
export class ConvertProspectUseCase {
  private readonly repository = inject(ACQUISITION_REPOSITORY)
  execute(params: ConvertProspectParams) {
    return this.repository.convertProspect(params)
  }
}
