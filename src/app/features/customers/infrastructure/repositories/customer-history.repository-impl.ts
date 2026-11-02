import { inject, Injectable } from "@angular/core"
import { CustomerHistoryRepository } from "../../domain/repositories/customer-history.repository"
import { CustomerHistoryHttpSource } from "../source/customer-history-http.source"

@Injectable({ providedIn: "root" })
export class CustomerHistoryRepositoryImpl implements CustomerHistoryRepository {
  private readonly source = inject(CustomerHistoryHttpSource)
  getHistory(customerId: number, limit?: number) {
    return this.source.getHistory(customerId, limit)
  }
}
