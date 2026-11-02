import { TestBed } from "@angular/core/testing"
import { of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { customerFixture } from "../../domain/customer.fixture"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"
import { UpdateCustomerUseCase } from "./update-customer.use-case"

describe("UpdateCustomerUseCase", () => {
  let useCase: UpdateCustomerUseCase
  let repository: CustomerRepository

  beforeEach(() => {
    repository = {
      findPage: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    }
    TestBed.configureTestingModule({
      providers: [UpdateCustomerUseCase, { provide: CUSTOMER_REPOSITORY, useValue: repository }]
    })
    useCase = TestBed.inject(UpdateCustomerUseCase)
  })

  it("delegates customer updates to the repository", () => {
    const customer = customerFixture(1, "María Torres", "maria@example.com")
    vi.mocked(repository.update).mockReturnValue(of(Result.success(customer)))

    useCase
      .execute(customer)
      .subscribe(result => expect(result).toMatchObject({ success: true, data: customer }))

    expect(repository.update).toHaveBeenCalledWith(customer)
  })
})
