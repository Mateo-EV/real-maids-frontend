import { Injectable } from "@angular/core"
import { map, Observable, of, switchMap, timer } from "rxjs"
import { CustomerError } from "../../domain/errors/customer.error"
import { Customer } from "../../domain/entities/customer.entity"
import { Result } from "@/app/shared/utils/result"

const DEMO_CUSTOMERS: readonly Customer[] = [
  new Customer("customer-001", "María López", "maria.lopez@example.com", "+1 555 010 1001"),
  new Customer("customer-002", "Carlos Ramírez", "carlos.ramirez@example.com", "+1 555 010 1002")
]

const cloneCustomer = (customer: Customer): Customer =>
  Object.freeze(new Customer(customer.id, customer.name, customer.email, customer.phone))

@Injectable({ providedIn: "root" })
export class CustomerInMemorySource {
  private customers = DEMO_CUSTOMERS.map(cloneCustomer)
  private nextCustomerId = this.customers.length + 1

  findAll(): Observable<Result<readonly Customer[], CustomerError>> {
    return timer(250).pipe(map(() => Result.success(this.customers.map(cloneCustomer))))
  }

  findById(id: string): Observable<Result<Customer, CustomerError>> {
    return timer(150).pipe(
      map(() => {
        const customer = this.customers.find(item => item.id === id)
        return customer
          ? Result.success(cloneCustomer(customer))
          : Result.failure(new CustomerError("CUSTOMER_NOT_FOUND"))
      })
    )
  }

  create(customer: Omit<Customer, "id">): Observable<Result<Customer, CustomerError>> {
    const input = { name: customer.name, email: customer.email, phone: customer.phone }

    return timer(150).pipe(
      switchMap(() => {
        const customer = cloneCustomer(
          new Customer(this.generateId(), input.name, input.email, input.phone)
        )
        this.customers = [...this.customers, customer]

        return of(Result.success(cloneCustomer(customer)))
      })
    )
  }

  update(customer: Customer): Observable<Result<Customer, CustomerError>> {
    const input = cloneCustomer(customer)

    return timer(150).pipe(
      switchMap(() => {
        const customerIndex = this.customers.findIndex(item => item.id === input.id)
        if (customerIndex === -1) {
          return of(Result.failure(new CustomerError("CUSTOMER_NOT_FOUND")))
        }

        const updatedCustomer = cloneCustomer(input)
        this.customers = this.customers.map(item =>
          item.id === updatedCustomer.id ? updatedCustomer : item
        )

        return of(Result.success(cloneCustomer(updatedCustomer)))
      })
    )
  }

  delete(id: string): Observable<Result<void, CustomerError>> {
    return timer(150).pipe(
      switchMap(() => {
        const customerExists = this.customers.some(item => item.id === id)
        if (!customerExists) {
          return of(Result.failure(new CustomerError("CUSTOMER_NOT_FOUND")))
        }

        this.customers = this.customers.filter(item => item.id !== id)

        return of(Result.success(undefined))
      })
    )
  }

  private generateId(): string {
    let id = `customer-${String(this.nextCustomerId).padStart(3, "0")}`
    while (this.customers.some(customer => customer.id === id)) {
      this.nextCustomerId += 1
      id = `customer-${String(this.nextCustomerId).padStart(3, "0")}`
    }

    this.nextCustomerId += 1
    return id
  }
}
