import { TestBed } from "@angular/core/testing"
import { of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { CustomerError } from "../errors/customer.error"
import { Customer } from "../../domain/entities/customer.entity"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"
import { CustomerService } from "./customer.service"

describe("CustomerService", () => {
  let service: CustomerService
  let repository: CustomerRepository

  beforeEach(() => {
    repository = {
      findAll: vi.fn(),
      findById: vi.fn()
    }

    TestBed.configureTestingModule({
      providers: [CustomerService, { provide: CUSTOMER_REPOSITORY, useValue: repository }]
    })

    service = TestBed.inject(CustomerService)
  })

  it("delegates catalog lookup to the repository", () => {
    const customers = [new Customer("customer-001", "María López", "maria.lopez@example.com")]
    vi.mocked(repository.findAll).mockReturnValue(of(Result.success(customers)))

    service.findAll().subscribe(result => {
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(customers)
      }
    })

    expect(repository.findAll).toHaveBeenCalledOnce()
  })

  it("delegates an identifier lookup to the repository", () => {
    vi.mocked(repository.findById).mockReturnValue(
      of(Result.failure(new CustomerError("CUSTOMER_NOT_FOUND")))
    )

    service.findById("customer-404").subscribe(result => expect(result.success).toBe(false))

    expect(repository.findById).toHaveBeenCalledWith("customer-404")
  })
})
