import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { OperationsError } from "../../domain/errors/operations.error"
import { ServiceRequestSummary } from "../../domain/models/operations-read.models"
import {
  CancelServiceRequestParams,
  CreateServiceRequestParams,
  UpdateServiceRequestParams
} from "../../domain/params/operations.params"
import { OPERATIONS_REPOSITORY } from "../../domain/repositories/operations.repository"

@Injectable({ providedIn: "root" })
export class CreateServiceRequestUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)
  execute(params: CreateServiceRequestParams) {
    return this.repository.createRequest(params)
  }
}

@Injectable({ providedIn: "root" })
export class UpdateServiceRequestUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)
  execute(id: number, params: UpdateServiceRequestParams) {
    return this.repository.updateRequest(id, params)
  }
}

@Injectable({ providedIn: "root" })
export class CancelServiceRequestUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)
  execute(
    id: number,
    params: CancelServiceRequestParams
  ): Observable<Result<ServiceRequestSummary, OperationsError>> {
    return this.repository.cancelRequest(id, params)
  }
}
