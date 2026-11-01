import { TestBed } from "@angular/core/testing"
import { of } from "rxjs"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import {
  CUSTOMER_REPOSITORY,
  CustomerRepository
} from "../../domain/repositories/customer.repository"
import { DeleteCustomerUseCase } from "./delete-customer.use-case"

describe("DeleteCustomerUseCase", () => {
  let useCase: DeleteCustomerUseCase
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
      providers: [DeleteCustomerUseCase, { provide: CUSTOMER_REPOSITORY, useValue: repository }]
    })
    useCase = TestBed.inject(DeleteCustomerUseCase)
  })

  it("delegates customer deletion to the repository", () => {
    vi.mocked(repository.delete).mockReturnValue(of(Result.success(undefined)))

    useCase.execute(1).subscribe(result => expect(result).toMatchObject({ success: true }))

    expect(repository.delete).toHaveBeenCalledWith(1)
  })
})
