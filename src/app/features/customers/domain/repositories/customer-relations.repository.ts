import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { CustomerContact } from "../entities/customer-contact.entity"
import { CustomerPreference } from "../entities/customer-preference.entity"
import { CustomerError } from "../errors/customer.error"
import {
  CreateCustomerContactParams,
  UpdateCustomerContactParams,
  CreateCustomerPreferenceParams,
  UpdateCustomerPreferenceParams
} from "../params/customer-relations.params"

/** Confirmed customer-owned contacts/preferences; nullable fields are replaced on PUT. */
export interface CustomerRelationsRepository {
  listContacts(customerId: number): Observable<Result<readonly CustomerContact[], CustomerError>>
  createContact(
    customerId: number,
    params: CreateCustomerContactParams
  ): Observable<Result<CustomerContact, CustomerError>>
  updateContact(
    customerId: number,
    params: UpdateCustomerContactParams
  ): Observable<Result<CustomerContact, CustomerError>>
  listPreferences(
    customerId: number
  ): Observable<Result<readonly CustomerPreference[], CustomerError>>
  createPreference(
    customerId: number,
    params: CreateCustomerPreferenceParams
  ): Observable<Result<CustomerPreference, CustomerError>>
  updatePreference(
    customerId: number,
    params: UpdateCustomerPreferenceParams
  ): Observable<Result<CustomerPreference, CustomerError>>
}
export const CUSTOMER_RELATIONS_REPOSITORY = new InjectionToken<CustomerRelationsRepository>(
  "customer-relations.repository"
)
