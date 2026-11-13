import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { CustomerError } from "../errors/customer.error"
import { Customer } from "../entities/customer.entity"
import { Result } from "@/app/shared/utils/result"
import { CreateCustomerParams, UpdateCustomerParams } from "../params/customer.params"

import { CustomerListQuery } from "../models/customer-list-query"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { ClienteEstadisticas } from "../params/cliente-estadisticas.params"

/** Active-only server pages, the server aggregate and profile actions. Status is a capability. */
export interface CustomerRepository {
  findById(id: number): Observable<Result<Customer, CustomerError>>
  findPage(
    query: CustomerListQuery
  ): Observable<Result<PaginationResponse<Customer>, CustomerError>>
  findStatistics(): Observable<Result<ClienteEstadisticas, CustomerError>>
  create(customer: CreateCustomerParams): Observable<Result<Customer, CustomerError>>
  update(customer: UpdateCustomerParams): Observable<Result<Customer, CustomerError>>
}

export const CUSTOMER_REPOSITORY = new InjectionToken<CustomerRepository>("customer.repository")
