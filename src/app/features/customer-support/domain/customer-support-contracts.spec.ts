import { Injector } from "@angular/core"
import { firstValueFrom, of } from "rxjs"
import { describe, expect, it, vi } from "vitest"
import { Result } from "@/app/shared/utils/result"
import { CustomerSupportError, CustomerSupportErrorCode } from "./errors/customer-support.error"
import {
  CUSTOMER_SUPPORT_REPOSITORY,
  CustomerSupportRepository
} from "./repositories/customer-support.repository"
import { SupportDetail } from "./models/support-views"
import {
  CreateSupportRequestParams,
  ChangeSupportStateParams,
  SubmitSatisfactionSurveyParams
} from "./params/customer-support.params"

const codes: CustomerSupportErrorCode[] = [
  "NOT_FOUND",
  "VALIDATION",
  "UNAUTHENTICATED",
  "FORBIDDEN",
  "CONFLICT",
  "UNAVAILABLE",
  "INVALID_RESPONSE",
  "UNEXPECTED"
]

describe("customer support contracts", () => {
  it.each(codes)("exposes safe typed %s errors", code => {
    const error = new CustomerSupportError(code)
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe(code)
    expect(error.name).toBe("CustomerSupportError")
    expect(error.message).toBe(`Customer support operation failed: ${code}`)
  })

  it("keeps redacted DTOs distinct from schema IDs and supports confirmed actions", async () => {
    const date = new Date("2026-03-02T12:00:00Z")
    const detail: SupportDetail = {
      request: {
        id: 1,
        customerId: 2,
        customerName: "Customer",
        orderId: null,
        orderCode: null,
        requestTypeId: 3,
        requestTypeName: "Question",
        requiresResponse: true,
        state: "RECIBIDA",
        stateName: "Recibida",
        subject: "Subject",
        description: "Description",
        registeredAt: date,
        closedAt: null
      },
      followUps: [{ id: 4, author: null, isFromCustomer: false, message: "Reply", createdAt: date }]
    }
    const failure = () => of(Result.failure(new CustomerSupportError("FORBIDDEN")))
    const repository: CustomerSupportRepository = {
      getRequestTypes: () =>
        of(Result.success([{ id: 3, name: "Question", requiresResponse: true }])),
      getRequestsPage: vi.fn(() =>
        of(Result.success({ items: [detail.request], total: 11, offset: 10, limit: 5 }))
      ),
      getRequest: () => of(Result.success(detail)),
      createRequest: vi.fn(() => of(Result.success(detail))),
      addMessage: failure,
      changeState: vi.fn(failure),
      getStatuses: failure,
      getSurveyByOrder: () => of(Result.success(null)),
      submitSurvey: failure
    }
    const injector = Injector.create({
      providers: [{ provide: CUSTOMER_SUPPORT_REPOSITORY, useValue: repository }]
    })
    const injected = injector.get(CUSTOMER_SUPPORT_REPOSITORY)
    expect(injected).toBe(repository)
    const query = {
      state: "RECIBIDA",
      requestTypeId: 3,
      customerId: 2,
      fromDate: "2026-03-01",
      toDate: "2026-03-08",
      offset: 10,
      limit: 5
    }
    expect(await firstValueFrom(injected.getRequestsPage(query))).toEqual(
      Result.success({ items: [detail.request], total: 11, offset: 10, limit: 5 })
    )
    expect(repository.getRequestsPage).toHaveBeenCalledWith(query)
    const params: CreateSupportRequestParams = {
      customerId: null,
      orderId: null,
      requestTypeId: 3,
      subject: "Subject",
      description: "Description"
    }
    expect(await firstValueFrom(injected.createRequest(params))).toEqual(Result.success(detail))
    expect(repository.createRequest).toHaveBeenCalledWith(params)
    const change: ChangeSupportStateParams = { state: "RESUELTA", message: null }
    expect(await firstValueFrom(injected.changeState(1, change))).toEqual(
      Result.failure(new CustomerSupportError("FORBIDDEN"))
    )
    expect(detail.followUps[0].author).toBeNull()
    expect(detail.followUps[0]).not.toHaveProperty("userId")
    expect(detail.request).not.toHaveProperty("statusId")
    expect(await firstValueFrom(injected.getSurveyByOrder(8))).toEqual(Result.success(null))
    injector.destroy()
  })

  it("uses CHECK-constrained survey inputs and excludes generated request metadata", () => {
    const survey: SubmitSatisfactionSurveyParams = {
      orderId: 1,
      customerId: 2,
      rating: 5,
      comment: null
    }
    expect(survey.comment).toBeNull()
    // @ts-expect-error SQL rating CHECK permits only 1 through 5.
    const invalid: SubmitSatisfactionSurveyParams = { ...survey, rating: 6 }
    expect(invalid.rating).toBe(6)
    const input: CreateSupportRequestParams = {
      customerId: 2,
      orderId: null,
      requestTypeId: 3,
      subject: "Subject",
      description: "Description"
    }
    // @ts-expect-error The initial state is assigned by the backend.
    const generated: CreateSupportRequestParams = { ...input, statusId: 1 }
    expect(generated).toHaveProperty("statusId")
  })
})
