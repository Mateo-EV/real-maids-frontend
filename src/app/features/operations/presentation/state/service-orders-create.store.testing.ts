import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Observable, Subscription } from "rxjs"
import { vi } from "vitest"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { CustomerHistoryStore } from "@/app/features/customers/presentation/state/customer-history.store"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import {
  GetServiceOrderByIdUseCase,
  ListServiceOrdersUseCase
} from "../../application/use-cases/service-order-read.use-cases"
import { CreateServiceOrderUseCase } from "../../application/use-cases/service-order-write.use-cases"
import {
  GetServiceRequestByIdUseCase,
  ListServiceRequestsUseCase
} from "../../application/use-cases/service-request-read.use-cases"
import {
  ServiceOrderDetail,
  ServiceOrderSummary,
  ServiceRequestSummary
} from "../../domain/models/operations-read.models"
import {
  CreateServiceOrderParams,
  ServiceOrderQuery,
  ServiceRequestQuery
} from "../../domain/params/operations.params"
import { ServiceOrdersStore } from "./service-orders.store"
import { ServiceRequestsStore } from "./service-requests.store"
import { ControlledOrderReads } from "./service-orders.store.testing"

export const createInput = (): CreateServiceOrderParams => ({
  requestId: 41,
  estimatedAmount: "12.30",
  observation: "  Literal observation  "
})
export const createCaller = (id = 19, expires = 4102444800000) =>
  AuthSession.create("Caller", `caller${id}@example.test`, null, expires, id)
export const requestSummary = (id = 41): ServiceRequestSummary => ({
  id,
  customerId: 8,
  customerName: "Authorized customer",
  propertyId: 31,
  propertyName: "Office",
  serviceTypeId: 4,
  serviceTypeName: "Cleaning",
  description: null,
  desiredDate: null,
  status: "registrada",
  registeredByName: "Operator",
  registeredAt: new Date("2026-03-02T04:30:00Z"),
  updatedAt: null
})
export const requestPage = (ids = [41]): PaginationResponse<ServiceRequestSummary> => ({
  items: ids.map(requestSummary),
  total: ids.length,
  offset: 0,
  limit: 20
})

/** New T6C fixtures only; the T6A read tests and fixtures stay frozen. */
export function createOrderHarness() {
  const lists = new ControlledOrderReads<
    ServiceOrderQuery,
    PaginationResponse<ServiceOrderSummary>
  >()
  const details = new ControlledOrderReads<number, ServiceOrderDetail>()
  const writes = new ControlledOrderReads<CreateServiceOrderParams, ServiceOrderDetail>()
  const requestLists = new ControlledOrderReads<
    ServiceRequestQuery,
    PaginationResponse<ServiceRequestSummary>
  >()
  const requestDetails = new ControlledOrderReads<number, ServiceRequestSummary>()
  const session = new BehaviorSubject<AuthSession | null>(createCaller())
  const history = { invalidateCustomer: vi.fn<(id: number) => void>() }
  const execute = vi.fn((params: CreateServiceOrderParams) => writes.execute(params))
  const authFactory = vi.fn(() => ({ session: () => session.value }))
  const writeFactory = vi.fn(() => ({ execute }))
  const historyFactory = vi.fn(() => history)
  const subscriptions: Subscription[] = []
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: AuthStore, useFactory: authFactory },
      { provide: ObserveAuthSessionUseCase, useValue: { execute: () => session } },
      { provide: ListServiceOrdersUseCase, useValue: lists },
      { provide: GetServiceOrderByIdUseCase, useValue: details },
      { provide: CreateServiceOrderUseCase, useFactory: writeFactory },
      { provide: ListServiceRequestsUseCase, useValue: requestLists },
      { provide: GetServiceRequestByIdUseCase, useValue: requestDetails },
      { provide: CustomerHistoryStore, useFactory: historyFactory }
    ]
  })
  return {
    lists,
    details,
    writes,
    requestLists,
    requestDetails,
    session,
    history,
    execute,
    authFactory,
    writeFactory,
    historyFactory,
    orders: () => TestBed.inject(ServiceOrdersStore),
    requests: () => TestBed.inject(ServiceRequestsStore),
    track<T>(operation: Observable<T>, next?: (value: T) => void) {
      const subscription = operation.subscribe(next)
      subscriptions.push(subscription)
      return subscription
    },
    stop: () => subscriptions.forEach(subscription => subscription.unsubscribe())
  }
}
