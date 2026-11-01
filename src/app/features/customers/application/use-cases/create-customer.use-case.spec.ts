import { TestBed } from "@angular/core/testing"
import { of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { customerFixture, customerInput } from "../../domain/customer.fixture"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"
import { CreateCustomerUseCase } from "./create-customer.use-case"

describe("CreateCustomerUseCase", () => {
  let useCase: CreateCustomerUseCase
  let repository: CustomerRepository

  beforeEach(() => {
    repository = {
      findAll: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    }
    TestBed.configureTestingModule({
      providers: [CreateCustomerUseCase, { provide: CUSTOMER_REPOSITORY, useValue: repository }]
    })
    useCase = TestBed.inject(CreateCustomerUseCase)
  })

  it("delegates customer creation to the repository", () => {
    const input = customerInput("Ana Torres", "ana@example.com")
    const customer = customerFixture(3, input.name, input.email)
    vi.mocked(repository.create).mockReturnValue(of(Result.success(customer)))

    useCase
      .execute(input)
      .subscribe(result => expect(result).toMatchObject({ success: true, data: customer }))

    expect(repository.create).toHaveBeenCalledWith(input)
  })
})
