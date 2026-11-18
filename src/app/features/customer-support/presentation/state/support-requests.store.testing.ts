import { Observable, Subscriber } from "rxjs"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
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
