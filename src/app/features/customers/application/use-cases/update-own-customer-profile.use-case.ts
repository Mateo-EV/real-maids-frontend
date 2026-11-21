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

/**
 * WP10 T7 / S2 — own-profile update. The captured `name`/`phone` are the whole payload; the backend
 * stays authoritative on validation, on the sign-in email and on every field this action never sends.
 */
@Injectable({ providedIn: "root" })
export class UpdateOwnCustomerProfileUseCase {
  private readonly customerRepository = inject<CustomerRepository>(CUSTOMER_REPOSITORY)

  execute(profile: UpdateOwnProfileParams): Observable<Result<Customer, CustomerError>> {
    return this.customerRepository.updateOwnProfile(profile)
  }
}
