import { inject, Injectable } from "@angular/core"
import { CustomerRelationsRepository } from "../../domain/repositories/customer-relations.repository"
import {
  CreateCustomerContactParams,
  UpdateCustomerContactParams,
  CreateCustomerPreferenceParams,
  UpdateCustomerPreferenceParams
} from "../../domain/params/customer-relations.params"
import { CustomerRelationsHttpSource } from "../source/customer-relations-http.source"

@Injectable({ providedIn: "root" })
export class CustomerRelationsRepositoryImpl implements CustomerRelationsRepository {
  private readonly source = inject(CustomerRelationsHttpSource)
  listContacts(customerId: number) {
    return this.source.listContacts(customerId)
  }
  createContact(customerId: number, params: CreateCustomerContactParams) {
    return this.source.createContact(customerId, params)
  }
  updateContact(customerId: number, params: UpdateCustomerContactParams) {
    return this.source.updateContact(customerId, params)
  }
  listPreferences(customerId: number) {
    return this.source.listPreferences(customerId)
  }
  createPreference(customerId: number, params: CreateCustomerPreferenceParams) {
    return this.source.createPreference(customerId, params)
  }
  updatePreference(customerId: number, params: UpdateCustomerPreferenceParams) {
    return this.source.updatePreference(customerId, params)
  }
}
