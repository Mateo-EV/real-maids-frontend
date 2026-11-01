import { Injectable } from "@angular/core"
import { map, Observable, timer } from "rxjs"
import { CustomerError } from "../../domain/errors/customer.error"
import { Customer, CustomerType } from "../../domain/entities/customer.entity"
import { CreateCustomerParams, UpdateCustomerParams } from "../../domain/params/customer.params"
import { Result } from "@/app/shared/utils/result"

const DEMO_CUSTOMERS: readonly Customer[] = [
  Customer.create(
    1,
    "María López",
    null,
    CustomerType.RESIDENTIAL,
    "maria.lopez@example.com",
    "+1 555 010 1001",
    null,
    null,
    null,
    true,
    new Date("2026-01-01T00:00:00Z"),
    null,
    null,
    null
  ),
  Customer.create(
    2,
    "Carlos Ramírez",
    null,
    CustomerType.RESIDENTIAL,
    "carlos.ramirez@example.com",
    "+1 555 010 1002",
    null,
    null,
    null,
    true,
    new Date("2026-01-01T00:00:00Z"),
    null,
    null,
    null
  )
]

const cloneCustomer = (customer: Customer): Customer =>
  Object.freeze(
    Customer.create(
      customer.id,
      customer.name,
      customer.userId,
      customer.type,
      customer.email,
      customer.phone,
      customer.taxIdentification,
      customer.systemOrigin,
      customer.externalId,
      customer.isActive,
      new Date(customer.createdAt),
      customer.updatedAt === null ? null : new Date(customer.updatedAt),
      customer.registeredByUserId,
      customer.prospectId
    )
  )

@Injectable({ providedIn: "root" })
export class CustomerInMemorySource {
  private customers = DEMO_CUSTOMERS.map(cloneCustomer)
  private nextCustomerId = Math.max(0, ...this.customers.map(customer => customer.id)) + 1

  findAll(): Observable<Result<readonly Customer[], CustomerError>> {
    return timer(250).pipe(map(() => Result.success(this.customers.map(cloneCustomer))))
  }

  findById(id: number): Observable<Result<Customer, CustomerError>> {
    return timer(150).pipe(
      map(() => {
        const customer = this.customers.find(item => item.id === id)
        return customer
          ? Result.success(cloneCustomer(customer))
          : Result.failure(new CustomerError("CUSTOMER_NOT_FOUND"))
      })
    )
  }

  create(customer: CreateCustomerParams): Observable<Result<Customer, CustomerError>> {
    const input = { ...customer }
    return timer(150).pipe(
      map(() => {
        const created = cloneCustomer(
          Customer.create(
            this.generateId(),
            input.name,
            null,
            input.type,
            input.email,
            input.phone,
            null,
            null,
            null,
            true,
            new Date(),
            null,
            null,
            null
          )
        )
        this.customers = [...this.customers, created]
        return Result.success(cloneCustomer(created))
      })
    )
  }

  update(customer: UpdateCustomerParams): Observable<Result<Customer, CustomerError>> {
    const input = {
      id: customer.id,
      name: customer.name,
      type: customer.type,
      email: customer.email,
      phone: customer.phone
    }
    return timer(150).pipe(
      map(() => {
        const existing = this.customers.find(item => item.id === input.id)
        if (!existing) return Result.failure(new CustomerError("CUSTOMER_NOT_FOUND"))
        const updated = cloneCustomer(
          Customer.create(
            existing.id,
            input.name,
            existing.userId,
            input.type,
            input.email,
            input.phone,
            existing.taxIdentification,
            existing.systemOrigin,
            existing.externalId,
            existing.isActive,
            existing.createdAt,
            new Date(),
            existing.registeredByUserId,
            existing.prospectId
          )
        )
        this.customers = this.customers.map(item => (item.id === updated.id ? updated : item))
        return Result.success(cloneCustomer(updated))
      })
    )
  }

  delete(id: number): Observable<Result<void, CustomerError>> {
    return timer(150).pipe(
      map(() => {
        if (!this.customers.some(item => item.id === id))
          return Result.failure(new CustomerError("CUSTOMER_NOT_FOUND"))
        this.customers = this.customers.filter(item => item.id !== id)
        return Result.success(undefined)
      })
    )
  }

  private generateId(): number {
    while (this.customers.some(customer => customer.id === this.nextCustomerId))
      this.nextCustomerId += 1
    return this.nextCustomerId++
  }
}
