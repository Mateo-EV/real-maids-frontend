import { inject, Injectable } from "@angular/core"
import { CUSTOMER_CAPABILITIES_REPOSITORY } from "../../domain/repositories/customer-capabilities.repository"
import { SetCustomerStatusParams } from "../../domain/params/customer.params"

@Injectable({ providedIn: "root" })
export class SetCustomerStatusUseCase {
  private readonly repository = inject(CUSTOMER_CAPABILITIES_REPOSITORY)
  execute(params: SetCustomerStatusParams) {
    return this.repository.setStatus(params)
  }
}
