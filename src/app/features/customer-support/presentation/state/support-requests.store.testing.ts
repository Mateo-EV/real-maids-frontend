import { PLATFORM_ID } from "@angular/core"
import { TestBed } from "@angular/core/testing"
import { BehaviorSubject, Observable, Subscriber, Subscription } from "rxjs"
import { vi } from "vitest"
import { ObserveAuthSessionUseCase } from "@/app/features/auth/application/use-cases/observe-auth-session.use-case"
import { AuthSession } from "@/app/features/auth/domain/entities/auth-session.entity"
import { AuthStore } from "@/app/features/auth/presentation/state/auth.store"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import {
  AddSupportMessageUseCase,
  ChangeSupportStateUseCase,
  CreateSupportRequestUseCase
} from "../../application/use-cases/customer-support-write.use-cases"
import {
  GetSupportRequestByIdUseCase,
  GetSupportRequestTypesUseCase,
  ListSupportRequestsUseCase
} from "../../application/use-cases/customer-support-read.use-cases"
import {
  CustomerSupportError,
  CustomerSupportErrorCode
} from "../../domain/errors/customer-support.error"
import {
  SupportDetail,
  SupportFollowUpView,
  SupportRequestTypeView,
  SupportRequestView
} from "../../domain/models/support-views"
import {
  AddSupportMessageParams,
  ChangeSupportStateParams,
  CreateSupportRequestParams,
  SupportRequestQuery
} from "../../domain/params/customer-support.params"
import { SupportRequestsStore } from "./support-requests.store"

/** A controlled public use-case response, including observable teardown evidence. */
export class SupportReadCall<K, T> {
  cancelled = false
  settled = false

  constructor(
    readonly key: K,
    private readonly subscriber: Subscriber<Result<T, CustomerSupportError>>
  ) {}

  succeed(value: T) {
    this.settled = true
    this.subscriber.next(Result.success(value))
    this.subscriber.complete()
  }

  fail(code: CustomerSupportErrorCode = "FORBIDDEN") {
    this.settled = true
    this.subscriber.next(Result.failure(new CustomerSupportError(code)))
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
export class ControlledSupportReads<K, T> {
  readonly calls: SupportReadCall<K | undefined, T>[] = []

  execute(key?: K): Observable<Result<T, CustomerSupportError>> {
    return new Observable(subscriber => {
      const call = new SupportReadCall(key, subscriber)
      this.calls.push(call)
      return () => {
        if (!call.settled) call.cancelled = true
      }
    })
  }

  latest(): SupportReadCall<K | undefined, T> {
    const call = this.calls.at(-1)
    if (!call) throw new Error("Expected a subscribed customer support read.")
    return call
  }
}

export const supportRequestView = (id = 5): SupportRequestView => ({
  id,
  customerId: 8,
  customerName: "Cliente autorizado",
  orderId: 41,
  orderCode: "ORD-41",
  requestTypeId: 2,
  requestTypeName: "Consulta",
  requiresResponse: true,
  state: "RECIBIDA",
  stateName: "Recibida",
  subject: "Asunto de prueba",
  description: "Descripción de prueba",
  registeredAt: new Date("2026-03-02T04:30:00Z"),
  closedAt: null
})

export const supportFollowUpView = (
  id = 9,
  author: string | null = "Agente de soporte"
): SupportFollowUpView => ({
  id,
  author,
  isFromCustomer: author === null,
  message: "Mensaje de prueba",
  createdAt: new Date("2026-03-02T05:00:00Z")
})

/** A redacted follow-up (`author: null`) must survive the store untouched. */
export const supportDetail = (
  id = 5,
  author: string | null = "Agente de soporte"
): SupportDetail => ({
  request: supportRequestView(id),
  followUps: [supportFollowUpView(id * 10, author)]
})

export const supportPage = (
  ids = [5],
  offset = 0,
  limit = 20,
  total = ids.length
): PaginationResponse<SupportRequestView> => ({
  items: ids.map(supportRequestView),
  total,
  offset,
  limit
})

export const supportTypeViews = (): SupportRequestTypeView[] => [
  { id: 1, name: "Consulta", requiresResponse: true },
  { id: 2, name: "Queja", requiresResponse: true },
  { id: 3, name: "Felicitación", requiresResponse: false }
]

/** A controlled write use case: one call recorded per subscription, with teardown evidence. */
export class ControlledSupportWrites<T> {
  readonly calls: SupportReadCall<undefined, T>[] = []

  execute(..._args: unknown[]): Observable<Result<T, CustomerSupportError>> {
    return new Observable(subscriber => {
      const call = new SupportReadCall<undefined, T>(undefined, subscriber)
      this.calls.push(call)
      return () => {
        if (!call.settled) call.cancelled = true
      }
    })
  }

  latest(): SupportReadCall<undefined, T> {
    const call = this.calls.at(-1)
    if (!call) throw new Error("Expected a subscribed customer support write.")
    return call
  }
}

export const supportCaller = (id = 19, expiresAt: number | null = 4102444800000, name = "Caller") =>
  AuthSession.create(name, `caller${id}@example.test`, null, expiresAt, id)

/** Only the documented write inputs; the transport owns value validation. */
export const createSupportRequestParams = (
  overrides: Partial<CreateSupportRequestParams> = {}
): CreateSupportRequestParams => ({
  customerId: 8,
  orderId: 41,
  requestTypeId: 2,
  subject: "Asunto de prueba",
  description: "Descripción de prueba",
  ...overrides
})

export const addSupportMessageParams = (
  message = "Mensaje de prueba"
): AddSupportMessageParams => ({ message })

export const changeSupportStateParams = (
  state = "EN_REVISION",
  message: string | null = null
): ChangeSupportStateParams => ({ state, message })

/** Read doubles plus the three write doubles, over one real session-read scope. */
export function createSupportWriteHarness() {
  const pages = new ControlledSupportReads<
    SupportRequestQuery,
    PaginationResponse<SupportRequestView>
  >()
  const details = new ControlledSupportReads<number, SupportDetail>()
  const types = new ControlledSupportReads<null, SupportRequestTypeView[]>()
  const create = new ControlledSupportWrites<SupportDetail>()
  const messages = new ControlledSupportWrites<SupportDetail>()
  const states = new ControlledSupportWrites<SupportDetail>()
  const session = new BehaviorSubject<AuthSession | null>(supportCaller())
  const authFactory = vi.fn(() => ({ session: () => session.value }))
  const sessionFactory = vi.fn(() => ({ execute: () => session.asObservable() }))
  const subscriptions: Subscription[] = []
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: "browser" },
      { provide: AuthStore, useFactory: authFactory },
      { provide: ObserveAuthSessionUseCase, useFactory: sessionFactory },
      { provide: ListSupportRequestsUseCase, useValue: pages },
      { provide: GetSupportRequestByIdUseCase, useValue: details },
      { provide: GetSupportRequestTypesUseCase, useValue: types },
      { provide: CreateSupportRequestUseCase, useValue: create },
      { provide: AddSupportMessageUseCase, useValue: messages },
      { provide: ChangeSupportStateUseCase, useValue: states }
    ]
  })
  return {
    pages,
    details,
    types,
    create,
    messages,
    states,
    session,
    authFactory,
    sessionFactory,
    store: () => TestBed.inject(SupportRequestsStore),
    track<T>(operation: Observable<T>, next?: (value: T) => void) {
      const subscription = operation.subscribe(next)
      subscriptions.push(subscription)
      return subscription
    },
    stop() {
      subscriptions.forEach(subscription => subscription.unsubscribe())
    }
  }
}
