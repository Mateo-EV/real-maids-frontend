import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { CustomerError } from "../errors/customer.error"
import { Customer } from "../entities/customer.entity"
import { Result } from "@/app/shared/utils/result"
import { CreateCustomerParams, UpdateCustomerParams } from "../params/customer.params"

/** Active-only unpaged catalog and profile actions. Status is a separate capability. */
export interface CustomerRepository {
  findById(id: number): Observable<Result<Customer, CustomerError>>
  findAll(): Observable<Result<readonly Customer[], CustomerError>>
  create(customer: CreateCustomerParams): Observable<Result<Customer, CustomerError>>
  update(customer: UpdateCustomerParams): Observable<Result<Customer, CustomerError>>
}

export const CUSTOMER_REPOSITORY = new InjectionToken<CustomerRepository>("customer.repository")
