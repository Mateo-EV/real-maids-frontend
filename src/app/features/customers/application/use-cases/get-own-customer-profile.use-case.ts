import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Customer } from "../../domain/entities/customer.entity"
import { CustomerError } from "../../domain/errors/customer.error"
import { UpdateOwnProfileParams } from "../../domain/params/customer.params"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"

/** WP10 T7 / S2 — the caller's own customer profile. Stateless: no state, no authorization claim. */
@Injectable({ providedIn: "root" })
export class GetOwnCustomerProfileUseCase {
  private readonly customerRepository = inject<CustomerRepository>(CUSTOMER_REPOSITORY)

  execute(): Observable<Result<Customer, CustomerError>> {
    return this.customerRepository.findOwnProfile()
  }
}
