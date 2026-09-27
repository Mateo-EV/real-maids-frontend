import { Injectable } from "@angular/core"
import { delay, Observable, of } from "rxjs"
import { CustomerError } from "../../domain/errors/customer.error"
import { Customer } from "../../domain/entities/customer.entity"
import { Result } from "@/app/shared/utils/result"

const DEMO_CUSTOMERS: readonly Customer[] = [
  new Customer("customer-001", "María López", "maria.lopez@example.com", "+1 555 010 1001"),
  new Customer(
    "customer-002",
    "Carlos Ramírez",
    "carlos.ramirez@example.com",
    "+1 555 010 1002"
  )
]

@Injectable({ providedIn: "root" })
export class CustomerInMemorySource {
  findAll(): Observable<Result<readonly Customer[], CustomerError>> {
    return of(Result.success(DEMO_CUSTOMERS)).pipe(delay(250))
  }

  findById(id: string): Observable<Result<Customer, CustomerError>> {
    const customer = DEMO_CUSTOMERS.find(item => item.id === id)

    return of(
      customer
        ? Result.success(customer)
        : Result.failure(new CustomerError("CUSTOMER_NOT_FOUND"))
    ).pipe(delay(150))
  }
}
