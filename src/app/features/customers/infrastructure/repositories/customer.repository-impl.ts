import { inject, Injectable } from "@angular/core"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { CreateCustomerParams, UpdateCustomerParams } from "../../domain/params/customer.params"
import { CustomerRepository } from "../../domain/repositories/customer.repository"
import { CustomerHttpSource } from "../source/customer-http.source"

@Injectable({ providedIn: "root" })
export class CustomerRepositoryImpl implements CustomerRepository {
  private readonly source = inject(CustomerHttpSource)

  findPage(query: PaginationParams = {}) {
    return this.source.findPage(query)
  }

  findById(id: number) {
    return this.source.findById(id)
  }

  create(customer: CreateCustomerParams) {
    return this.source.create(customer)
  }

  update(customer: UpdateCustomerParams) {
    return this.source.update(customer)
  }
}
