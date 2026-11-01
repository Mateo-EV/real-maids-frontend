import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { CustomerError } from "../../domain/errors/customer.error"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"

@Injectable({ providedIn: "root" })
export class DeleteCustomerUseCase {
  private readonly customerRepository = inject<CustomerRepository>(CUSTOMER_REPOSITORY)

  execute(id: number): Observable<Result<void, CustomerError>> {
    return this.customerRepository.delete(id)
  }
}
