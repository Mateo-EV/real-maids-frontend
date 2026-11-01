import { Injector } from "@angular/core"
import { firstValueFrom, of } from "rxjs"
import { expect, expectTypeOf, it } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { OperationsError } from "./errors/operations.error"
import { OPERATIONS_REPOSITORY, OperationsRepository } from "./repositories/operations.repository"
import {
  CreateQuoteParams,
  CreateQuoteLineParams,
  CreateServiceOrderParams,
  UpdateServiceOrderParams,
  UpdateServiceRequestParams,
  ScheduleServiceOrderParams,
  ReplaceServiceAssignmentsParams
} from "./params/operations.params"

it("binds the whole area contract and preserves typed failures", async () => {
  const error = new OperationsError("CONFLICT", "Operation cannot be completed")
  expect(error).toBeInstanceOf(Error)
  expect(error.name).toBe("OperationsError")
  expect(error.code).toBe("CONFLICT")
  expect(error.message).toBe("Operation cannot be completed")
  const fail = () => of(Result.failure(error))
  const repository: OperationsRepository = {
    getRequests: fail,
    getRequest: fail,
    createRequest: fail,
    updateRequest: fail,
    cancelRequest: fail,
    getOrders: fail,
    getOrder: fail,
    createOrder: fail,
    updateOrder: fail,
    changeOrderStatus: fail,
    scheduleOrder: fail,
    replaceAssignments: fail,
    getAgenda: fail,
    getActiveReschedulingReasons: fail,
    getQuotes: fail,
    getQuote: fail,
    createQuote: fail,
    updateQuote: fail,
    getQuoteLines: fail,
    createQuoteLine: fail,
    updateQuoteLine: fail,
    getContracts: fail,
    getContract: fail,
    createContract: fail,
    updateContract: fail,
    getOrderStatuses: fail,
    createOrderStatus: fail,
    updateOrderStatus: fail,
    getReschedulingReasons: fail,
    createReschedulingReason: fail,
    updateReschedulingReason: fail
  }
  const injector = Injector.create({
    providers: [{ provide: OPERATIONS_REPOSITORY, useValue: repository }]
  })
  expect(injector.get(OPERATIONS_REPOSITORY)).toBe(repository)
  for (const operation of Object.values(repository)) {
    const result = await firstValueFrom<Result<unknown, OperationsError>>(operation())
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error).toBe(error)
  }
})

it("retains shared page metadata and request projection without invented registrar IDs", async () => {
  const timestamp = new Date("2028-02-29T12:34:56.123Z")
  const page = {
    items: [
      {
        id: 5,
        customerId: 6,
        customerName: "Customer",
        propertyId: 7,
        propertyName: "Office",
        serviceTypeId: 8,
        serviceTypeName: "Cleaning",
        description: null,
        desiredDate: "2028-02-29",
        status: "registrada",
        registeredByName: "Registrar",
        registeredAt: timestamp,
        updatedAt: null
      }
    ],
    total: 45,
    offset: 20,
    limit: 10
  }
  const read: OperationsRepository["getRequests"] = () => of(Result.success(page))
  const result = await firstValueFrom(read({ offset: 20, limit: 10 }))
  expect(result.success).toBe(true)
  if (result.success) expect(result.data).toEqual(page)
  expectTypeOf<typeof page>().toExtend<PaginationResponse<(typeof page.items)[number]>>()
  expectTypeOf<
    Extract<"id" | "number" | "subtotal" | "total" | "userId" | "issuedAt", keyof CreateQuoteParams>
  >().toEqualTypeOf<never>()
  expectTypeOf<
    Extract<"subtotal" | "quoteId", keyof CreateQuoteLineParams>
  >().toEqualTypeOf<never>()
  expectTypeOf<
    Extract<
      "statusId" | "code" | "createdAt" | "registeredByUserId",
      keyof CreateServiceOrderParams
    >
  >().toEqualTypeOf<never>()
  expectTypeOf<keyof UpdateServiceOrderParams>().toEqualTypeOf<"estimatedAmount" | "observation">()
  expectTypeOf<
    Extract<"customerId" | "status" | "userId" | "updatedAt", keyof UpdateServiceRequestParams>
  >().toEqualTypeOf<never>()
  expectTypeOf<ScheduleServiceOrderParams["endTime"]>().toEqualTypeOf<string | null>()
  expectTypeOf<
    ReplaceServiceAssignmentsParams["assignments"][number]["role"]
  >().toEqualTypeOf<string>()
})

it("supports empty whole-team replacement without requiring generated assignment metadata", async () => {
  const replace: OperationsRepository["replaceAssignments"] = (_id, params) => {
    expect(params).toEqual({ assignments: [] })
    return of(Result.failure(new OperationsError("FORBIDDEN", "Denied")))
  }
  expect((await firstValueFrom(replace(5, { assignments: [] }))).success).toBe(false)
})
