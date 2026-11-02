import { inject, Injectable } from "@angular/core"
import { CustomerCapabilitiesRepository } from "../../domain/repositories/customer-capabilities.repository"
import {
  SetCustomerStatusParams,
  LinkCustomerAccountParams
} from "../../domain/params/customer.params"
import { CustomerHttpSource } from "../source/customer-http.source"

@Injectable({ providedIn: "root" })
export class CustomerCapabilitiesRepositoryImpl implements CustomerCapabilitiesRepository {
  private readonly source = inject(CustomerHttpSource)
  setStatus(params: SetCustomerStatusParams) {
    return this.source.setStatus(params)
  }
  linkAccount(params: LinkCustomerAccountParams) {
    return this.source.linkAccount(params)
  }
}
