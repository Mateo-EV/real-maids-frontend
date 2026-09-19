import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { CustomerError } from "../errors/customer.error"
import { Customer } from "../../domain/entities/customer.entity"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"
import { Result } from "@/app/shared/utils/result"

@Injectable({ providedIn: "root" })
export class CustomerService {
  private readonly customerRepository = inject<CustomerRepository>(CUSTOMER_REPOSITORY)

  findAll(): Observable<Result<readonly Customer[], CustomerError>> {
    return this.customerRepository.findAll()
  }

  findById(id: string): Observable<Result<Customer, CustomerError>> {
    return this.customerRepository.findById(id)
  }
}
