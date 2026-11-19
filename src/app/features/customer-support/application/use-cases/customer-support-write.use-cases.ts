import { inject, Injectable } from "@angular/core"
import {
  AddSupportMessageParams,
  ChangeSupportStateParams,
  CreateSupportRequestParams
} from "../../domain/params/customer-support.params"
import { CUSTOMER_SUPPORT_REPOSITORY } from "../../domain/repositories/customer-support.repository"

@Injectable({ providedIn: "root" })
export class CreateSupportRequestUseCase {
  private readonly repository = inject(CUSTOMER_SUPPORT_REPOSITORY)

  execute(params: CreateSupportRequestParams) {
    return this.repository.createRequest(params)
  }
}

@Injectable({ providedIn: "root" })
export class AddSupportMessageUseCase {
  private readonly repository = inject(CUSTOMER_SUPPORT_REPOSITORY)

  execute(id: number, params: AddSupportMessageParams) {
    return this.repository.addMessage(id, params)
  }
}

@Injectable({ providedIn: "root" })
export class ChangeSupportStateUseCase {
  private readonly repository = inject(CUSTOMER_SUPPORT_REPOSITORY)

  execute(id: number, params: ChangeSupportStateParams) {
    return this.repository.changeState(id, params)
  }
}
