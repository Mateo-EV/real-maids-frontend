import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Customer } from "../../domain/entities/customer.entity"
import { CustomerError } from "../../domain/errors/customer.error"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"
import { Result } from "@/app/shared/utils/result"
import { CustomerListQuery } from "../../domain/models/customer-list-query"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"

@Injectable({ providedIn: "root" })
export class ListCustomersUseCase {
  private readonly customerRepository = inject<CustomerRepository>(CUSTOMER_REPOSITORY)

  execute(
    query: CustomerListQuery = {}
  ): Observable<Result<PaginationResponse<Customer>, CustomerError>> {
    return this.customerRepository.findPage(query)
  }
}
