import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { CustomerError } from "../errors/customer.error"
import { Customer } from "../entities/customer.entity"
import { Result } from "@/app/shared/utils/result"
import {
  CreateCustomerParams,
  UpdateCustomerParams,
  UpdateOwnProfileParams
} from "../params/customer.params"

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
  /**
   * The caller's own profile (WP10 T7). No id and no query travel: the backend resolves the customer
   * from the session, and a `404` means the authenticated account is not linked to a customer yet.
   */
  findOwnProfile(): Observable<Result<Customer, CustomerError>>
  /** Own-profile update; the payload is exactly `name` and `phone` (`UpdateOwnProfileParams`). */
  updateOwnProfile(profile: UpdateOwnProfileParams): Observable<Result<Customer, CustomerError>>
}

export const CUSTOMER_REPOSITORY = new InjectionToken<CustomerRepository>("customer.repository")
