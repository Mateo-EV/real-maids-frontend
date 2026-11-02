import { inject, Injectable } from "@angular/core"
import { CUSTOMER_HISTORY_REPOSITORY } from "../../domain/repositories/customer-history.repository"

@Injectable({ providedIn: "root" })
export class GetCustomerHistoryUseCase {
  private readonly repository = inject(CUSTOMER_HISTORY_REPOSITORY)
  execute(customerId: number, limit?: number) {
    return this.repository.getHistory(customerId, limit)
  }
}
