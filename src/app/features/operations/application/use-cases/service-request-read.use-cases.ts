import { inject, Injectable } from "@angular/core"
import { ServiceRequestQuery } from "../../domain/params/operations.params"
import { OPERATIONS_REPOSITORY } from "../../domain/repositories/operations.repository"

@Injectable({ providedIn: "root" })
export class ListServiceRequestsUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)

  execute(query: ServiceRequestQuery) {
    return this.repository.getRequests(query)
  }
}

@Injectable({ providedIn: "root" })
export class GetServiceRequestByIdUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)

  execute(id: number) {
    return this.repository.getRequest(id)
  }
}
