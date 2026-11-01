import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Customer } from "../entities/customer.entity"
import { CustomerError } from "../errors/customer.error"
import { LinkCustomerAccountParams, SetCustomerStatusParams } from "../params/customer.params"

/** Confirmed controller capabilities, intentionally unwired. */
export interface CustomerCapabilitiesRepository {
  setStatus(params: SetCustomerStatusParams): Observable<Result<Customer, CustomerError>>
  linkAccount(params: LinkCustomerAccountParams): Observable<Result<Customer, CustomerError>>
}
export const CUSTOMER_CAPABILITIES_REPOSITORY = new InjectionToken<CustomerCapabilitiesRepository>(
  "customer-capabilities.repository"
)
