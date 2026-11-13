import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { CustomerError } from "../../domain/errors/customer.error"
import { ClienteEstadisticas } from "../../domain/params/cliente-estadisticas.params"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"

@Injectable({ providedIn: "root" })
export class GetCustomerStatisticsUseCase {
  private readonly customerRepository = inject<CustomerRepository>(CUSTOMER_REPOSITORY)

  execute(): Observable<Result<ClienteEstadisticas, CustomerError>> {
    return this.customerRepository.findStatistics()
  }
}
