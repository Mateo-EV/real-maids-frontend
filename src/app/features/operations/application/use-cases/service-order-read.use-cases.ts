import { inject, Injectable } from "@angular/core"
import { ServiceOrderQuery } from "../../domain/params/operations.params"
import { OPERATIONS_REPOSITORY } from "../../domain/repositories/operations.repository"

@Injectable({ providedIn: "root" })
export class ListServiceOrdersUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)
  execute(query: ServiceOrderQuery) {
    return this.repository.getOrders(query)
  }
}
@Injectable({ providedIn: "root" })
export class GetServiceOrderByIdUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)
  execute(id: number) {
    return this.repository.getOrder(id)
  }
}

@Injectable({ providedIn: "root" })
export class GetActiveReschedulingReasonsUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)
  execute() {
    return this.repository.getActiveReschedulingReasons()
  }
}
