import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Customer } from "../../domain/entities/customer.entity"
import { CustomerError } from "../../domain/errors/customer.error"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"
import { Result } from "@/app/shared/utils/result"

@Injectable({ providedIn: "root" })
export class ListCustomersUseCase {
  private readonly customerRepository = inject<CustomerRepository>(CUSTOMER_REPOSITORY)

  execute(): Observable<Result<readonly Customer[], CustomerError>> {
    return this.customerRepository.findAll()
  }
}
