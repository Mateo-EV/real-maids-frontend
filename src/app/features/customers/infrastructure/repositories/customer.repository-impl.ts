import { inject, Injectable } from "@angular/core"
import { CreateCustomerParams, UpdateCustomerParams } from "../../domain/params/customer.params"
import { CustomerRepository } from "../../domain/repositories/customer.repository"
import { CustomerInMemorySource } from "../source/customer-in-memory.source"

@Injectable({ providedIn: "root" })
export class CustomerRepositoryImpl implements CustomerRepository {
  private readonly source = inject(CustomerInMemorySource)

  findAll() {
    return this.source.findAll()
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

  delete(id: number) {
    return this.source.delete(id)
  }
}
