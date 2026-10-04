import { inject, Injectable } from "@angular/core"
import { Customer } from "../../domain/entities/customer.entity"
import { CustomerRepository } from "../../domain/repositories/customer.repository"
import { CustomerInMemorySource } from "../source/customer-in-memory.source"

@Injectable({ providedIn: "root" })
export class CustomerRepositoryImpl implements CustomerRepository {
  private readonly source = inject(CustomerInMemorySource)

  findAll() {
    return this.source.findAll()
  }

  findById(id: string) {
    return this.source.findById(id)
  }

  create(customer: Omit<Customer, "id">) {
    return this.source.create(customer)
  }

  update(customer: Customer) {
    return this.source.update(customer)
  }

  delete(id: string) {
    return this.source.delete(id)
  }
}
