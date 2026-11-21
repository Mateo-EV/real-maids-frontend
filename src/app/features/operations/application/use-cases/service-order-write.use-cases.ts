import { inject, Injectable } from "@angular/core"
import {
  ChangeOrderStatusParams,
  CreateServiceOrderParams,
  ScheduleServiceOrderParams
} from "../../domain/params/operations.params"
import { OPERATIONS_REPOSITORY } from "../../domain/repositories/operations.repository"

@Injectable({ providedIn: "root" })
export class CreateServiceOrderUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)
  execute(params: CreateServiceOrderParams) {
    return this.repository.createOrder(params)
  }
}

@Injectable({ providedIn: "root" })
export class ChangeOrderStatusUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)
  execute(id: number, params: ChangeOrderStatusParams) {
    return this.repository.changeOrderStatus(id, params)
  }
}

@Injectable({ providedIn: "root" })
export class ScheduleServiceOrderUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)
  execute(id: number, params: ScheduleServiceOrderParams) {
    return this.repository.scheduleOrder(id, params)
  }
}
