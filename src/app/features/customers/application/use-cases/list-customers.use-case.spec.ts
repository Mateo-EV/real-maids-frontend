import { TestBed } from "@angular/core/testing"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { customerFixture } from "../../domain/customer.fixture"
import { CustomerError } from "../../domain/errors/customer.error"
import { CUSTOMER_REPOSITORY } from "../../domain/repositories/customer.repository"
import { ListCustomersUseCase } from "./list-customers.use-case"

describe("ListCustomersUseCase", () => {
  it("delegates default and explicit page queries without state or mapping", async () => {
    const page = { items: [customerFixture(1, "Customer")], total: 21, offset: 20, limit: 20 }
    const failed = Result.failure(new CustomerError("FORBIDDEN"))
    const findPage = vi
      .fn()
      .mockReturnValueOnce(of(Result.success(page)))
      .mockReturnValueOnce(of(failed))
    TestBed.configureTestingModule({
      providers: [{ provide: CUSTOMER_REPOSITORY, useValue: { findPage } }]
    })
    const useCase = TestBed.inject(ListCustomersUseCase)
    expect(await firstValueFrom(useCase.execute())).toEqual(Result.success(page))
    expect(findPage).toHaveBeenNthCalledWith(1, {})
    const query = { offset: 20, limit: 10 }
    expect(await firstValueFrom(useCase.execute(query))).toBe(failed)
    expect(findPage).toHaveBeenNthCalledWith(2, query)
  })
})
