import { inject, Injectable } from "@angular/core"
import { Observable } from "rxjs"
import { CustomerError } from "../../domain/errors/customer.error"
import { Customer } from "../../domain/entities/customer.entity"
import { CustomerRepository } from "../../domain/repositories/customer.repository"
import { CustomerInMemorySource } from "../source/customer-in-memory.source"
import { Result } from "@/app/shared/utils/result"

@Injectable({ providedIn: "root" })
export class CustomerRepositoryImpl implements CustomerRepository {
  private readonly source = inject(CustomerInMemorySource)

  findAll(): Observable<Result<readonly Customer[], CustomerError>> {
    return this.source.findAll()
  }

  findById(id: string): Observable<Result<Customer, CustomerError>> {
    return this.source.findById(id)
  }
}
