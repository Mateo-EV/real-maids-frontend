import { inject, Injectable } from "@angular/core"
import { CUSTOMER_RELATIONS_REPOSITORY } from "../../domain/repositories/customer-relations.repository"
import {
  CreateCustomerContactParams,
  UpdateCustomerContactParams,
  CreateCustomerPreferenceParams,
  UpdateCustomerPreferenceParams
} from "../../domain/params/customer-relations.params"

@Injectable({ providedIn: "root" })
export class ListCustomerContactsUseCase {
  private readonly repository = inject(CUSTOMER_RELATIONS_REPOSITORY)
  execute(customerId: number) {
    return this.repository.listContacts(customerId)
  }
}
@Injectable({ providedIn: "root" })
export class CreateCustomerContactUseCase {
  private readonly repository = inject(CUSTOMER_RELATIONS_REPOSITORY)
  execute(customerId: number, params: CreateCustomerContactParams) {
    return this.repository.createContact(customerId, params)
  }
}
@Injectable({ providedIn: "root" })
export class UpdateCustomerContactUseCase {
  private readonly repository = inject(CUSTOMER_RELATIONS_REPOSITORY)
  execute(customerId: number, params: UpdateCustomerContactParams) {
    return this.repository.updateContact(customerId, params)
  }
}
@Injectable({ providedIn: "root" })
export class ListCustomerPreferencesUseCase {
  private readonly repository = inject(CUSTOMER_RELATIONS_REPOSITORY)
  execute(customerId: number) {
    return this.repository.listPreferences(customerId)
  }
}
@Injectable({ providedIn: "root" })
export class CreateCustomerPreferenceUseCase {
  private readonly repository = inject(CUSTOMER_RELATIONS_REPOSITORY)
  execute(customerId: number, params: CreateCustomerPreferenceParams) {
    return this.repository.createPreference(customerId, params)
  }
}
@Injectable({ providedIn: "root" })
export class UpdateCustomerPreferenceUseCase {
  private readonly repository = inject(CUSTOMER_RELATIONS_REPOSITORY)
  execute(customerId: number, params: UpdateCustomerPreferenceParams) {
    return this.repository.updatePreference(customerId, params)
  }
}
