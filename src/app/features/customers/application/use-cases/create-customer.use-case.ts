import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Customer } from "../../domain/entities/customer.entity"
import { CreateCustomerParams } from "../../domain/params/customer.params"
import { CustomerError } from "../../domain/errors/customer.error"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"

@Injectable({ providedIn: "root" })
export class CreateCustomerUseCase {
  private readonly customerRepository = inject<CustomerRepository>(CUSTOMER_REPOSITORY)

  execute(customer: CreateCustomerParams): Observable<Result<Customer, CustomerError>> {
    return this.customerRepository.create(customer)
  }
}
