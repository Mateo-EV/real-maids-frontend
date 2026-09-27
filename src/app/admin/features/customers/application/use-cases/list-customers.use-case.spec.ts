import { TestBed } from "@angular/core/testing"
import { of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { Customer } from "../../domain/entities/customer.entity"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"
import { ListCustomersUseCase } from "./list-customers.use-case"

describe("ListCustomersUseCase", () => {
  let useCase: ListCustomersUseCase
  let repository: CustomerRepository

  beforeEach(() => {
    repository = {
      findAll: vi.fn(),
      findById: vi.fn()
    }

    TestBed.configureTestingModule({
      providers: [ListCustomersUseCase, { provide: CUSTOMER_REPOSITORY, useValue: repository }]
    })

    useCase = TestBed.inject(ListCustomersUseCase)
  })

  it("delegates catalog lookup to the repository", () => {
    const customers = [new Customer("customer-001", "María López", "maria.lopez@example.com")]
    vi.mocked(repository.findAll).mockReturnValue(of(Result.success(customers)))

    useCase.execute().subscribe(result => {
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(customers)
      }
    })

    expect(repository.findAll).toHaveBeenCalledOnce()
  })
})
