import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { CustomerHistory } from "../entities/customer-history"
import { CustomerError } from "../errors/customer.error"

export interface CustomerHistoryRepository {
  getHistory(customerId: number, limit?: number): Observable<Result<CustomerHistory, CustomerError>>
}
export const CUSTOMER_HISTORY_REPOSITORY = new InjectionToken<CustomerHistoryRepository>(
  "customer-history.repository"
)
