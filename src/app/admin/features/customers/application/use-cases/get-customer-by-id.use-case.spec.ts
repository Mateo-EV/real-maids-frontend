import { TestBed } from "@angular/core/testing"
import { of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { CustomerError } from "../../domain/errors/customer.error"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"
import { GetCustomerByIdUseCase } from "./get-customer-by-id.use-case"

describe("GetCustomerByIdUseCase", () => {
  let useCase: GetCustomerByIdUseCase
  let repository: CustomerRepository

  beforeEach(() => {
    repository = {
      findAll: vi.fn(),
      findById: vi.fn()
    }

    TestBed.configureTestingModule({
      providers: [GetCustomerByIdUseCase, { provide: CUSTOMER_REPOSITORY, useValue: repository }]
    })

    useCase = TestBed.inject(GetCustomerByIdUseCase)
  })

  it("delegates an identifier lookup to the repository", () => {
    vi.mocked(repository.findById).mockReturnValue(
      of(Result.failure(new CustomerError("CUSTOMER_NOT_FOUND")))
    )

    useCase.execute("customer-404").subscribe(result => expect(result.success).toBe(false))

    expect(repository.findById).toHaveBeenCalledWith("customer-404")
  })
})
