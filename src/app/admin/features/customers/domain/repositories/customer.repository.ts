import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { CustomerError } from "../errors/customer.error"
import { Customer } from "../entities/customer.entity"
import { Result } from "@/app/shared/utils/result"

export interface CustomerRepository {
  findById(id: string): Observable<Result<Customer, CustomerError>>
  findAll(): Observable<Result<readonly Customer[], CustomerError>>
}

export const CUSTOMER_REPOSITORY = new InjectionToken<CustomerRepository>("customer.repository")
