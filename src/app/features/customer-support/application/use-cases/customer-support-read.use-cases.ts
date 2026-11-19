import { inject, Injectable } from "@angular/core"
import { SupportRequestQuery } from "../../domain/params/customer-support.params"
import { CUSTOMER_SUPPORT_REPOSITORY } from "../../domain/repositories/customer-support.repository"

@Injectable({ providedIn: "root" })
export class ListSupportRequestsUseCase {
  private readonly repository = inject(CUSTOMER_SUPPORT_REPOSITORY)

  execute(query: SupportRequestQuery) {
    return this.repository.getRequestsPage(query)
  }
}

@Injectable({ providedIn: "root" })
export class GetSupportRequestByIdUseCase {
  private readonly repository = inject(CUSTOMER_SUPPORT_REPOSITORY)

  execute(id: number) {
    return this.repository.getRequest(id)
  }
}

@Injectable({ providedIn: "root" })
export class GetSupportRequestTypesUseCase {
  private readonly repository = inject(CUSTOMER_SUPPORT_REPOSITORY)

  execute() {
    return this.repository.getRequestTypes()
  }
}
