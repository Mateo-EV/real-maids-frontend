import { inject, Injectable } from "@angular/core"
import { CreateServiceRequestParams } from "../../domain/params/operations.params"
import { OPERATIONS_REPOSITORY } from "../../domain/repositories/operations.repository"

@Injectable({ providedIn: "root" })
export class CreateServiceRequestUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)
  execute(params: CreateServiceRequestParams) {
    return this.repository.createRequest(params)
  }
}
