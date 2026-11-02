import { inject, Injectable } from "@angular/core"
import { CUSTOMER_CAPABILITIES_REPOSITORY } from "../../domain/repositories/customer-capabilities.repository"
import { LinkCustomerAccountParams } from "../../domain/params/customer.params"

@Injectable({ providedIn: "root" })
export class LinkCustomerAccountUseCase {
  private readonly repository = inject(CUSTOMER_CAPABILITIES_REPOSITORY)
  execute(params: LinkCustomerAccountParams) {
    return this.repository.linkAccount(params)
  }
}
