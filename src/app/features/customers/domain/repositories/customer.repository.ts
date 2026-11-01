import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { CustomerError } from "../errors/customer.error"
import { Customer } from "../entities/customer.entity"
import { Result } from "@/app/shared/utils/result"
import { CreateCustomerParams, UpdateCustomerParams } from "../params/customer.params"

/** Existing demo CRUD contract; delete is local-only, not a confirmed backend operation. */
export interface CustomerRepository {
  findById(id: number): Observable<Result<Customer, CustomerError>>
  findAll(): Observable<Result<readonly Customer[], CustomerError>>
  create(customer: CreateCustomerParams): Observable<Result<Customer, CustomerError>>
  update(customer: UpdateCustomerParams): Observable<Result<Customer, CustomerError>>
  delete(id: number): Observable<Result<void, CustomerError>>
}

export const CUSTOMER_REPOSITORY = new InjectionToken<CustomerRepository>("customer.repository")
