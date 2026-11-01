import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Customer } from "../../domain/entities/customer.entity"
import { UpdateCustomerParams } from "../../domain/params/customer.params"
import { CustomerError } from "../../domain/errors/customer.error"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"

@Injectable({ providedIn: "root" })
export class UpdateCustomerUseCase {
  private readonly customerRepository = inject<CustomerRepository>(CUSTOMER_REPOSITORY)

  execute(customer: UpdateCustomerParams): Observable<Result<Customer, CustomerError>> {
    return this.customerRepository.update(customer)
  }
}
