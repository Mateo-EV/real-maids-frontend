import { Observable, Subscriber } from "rxjs"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { OperationsError, OperationsErrorCode } from "../../domain/errors/operations.error"
import { ServiceOrderDetail, ServiceOrderSummary } from "../../domain/models/operations-read.models"

/** A controlled public use-case response, including observable teardown evidence. */
export class OrderReadCall<K, T> {
  cancelled = false
  settled = false

  constructor(
    readonly key: K,
    private readonly subscriber: Subscriber<Result<T, OperationsError>>
  ) {}

  succeed(value: T) {
    this.settled = true
    this.subscriber.next(Result.success(value))
    this.subscriber.complete()
  }

  fail(code: OperationsErrorCode = "FORBIDDEN") {
    this.settled = true
    this.subscriber.next(Result.failure(new OperationsError(code, "Safe order read failure.")))
    this.subscriber.complete()
  }

  throwError(value: unknown) {
    this.settled = true
    this.subscriber.error(value)
  }

  completeEmpty() {
    this.settled = true
    this.subscriber.complete()
  }
}

/** Calls are recorded on subscription, never by inspecting production state. */
export class ControlledOrderReads<K, T> {
  readonly calls: OrderReadCall<K, T>[] = []

  execute(key: K): Observable<Result<T, OperationsError>> {
    return new Observable(subscriber => {
      const call = new OrderReadCall(key, subscriber)
      this.calls.push(call)
      return () => {
        if (!call.settled) call.cancelled = true
      }
    })
  }

  latest(): OrderReadCall<K, T> {
    const call = this.calls.at(-1)
    if (!call) throw new Error("Expected a subscribed order use-case read.")
    return call
  }
}

export const orderSummary = (id = 17): ServiceOrderSummary => ({
  id,
  code: `ORDER-${id}`,
  status: "PENDIENTE",
  statusName: "Pendiente",
  requestId: 41,
  customerId: 8,
  customerName: "Authorized customer",
  propertyId: 31,
  propertyName: "Office",
  serviceTypeId: 4,
  serviceTypeName: "Cleaning",
  estimatedDurationMinutes: 60,
  estimatedAmount: "0.00",
  observation: null,
  schedule: null,
  assignedStaff: [],
  createdAt: new Date("2026-03-02T04:30:00Z"),
  updatedAt: null
})

export const orderDetail = (id = 17): ServiceOrderDetail => ({
  order: orderSummary(id),
  property: {
    id: 31,
    customerId: 8,
    alias: null,
    address: "Test office",
    city: null,
    region: null,
    postalCode: null,
    areaSquareMeters: "10.00",
    roomCount: 0,
    bathroomCount: null,
    accessInstructions: "Synthetic instruction",
    doorCode: null,
    hasPets: false,
    isActive: true,
    createdAt: new Date("2026-03-01T00:00:00Z")
  },
  statusHistory: [],
  schedules: []
})

export const orderPage = (
  ids = [17],
  offset = 0,
  limit = 20,
  total = ids.length
): PaginationResponse<ServiceOrderSummary> => ({
  items: ids.map(orderSummary),
  total,
  offset,
  limit
})
