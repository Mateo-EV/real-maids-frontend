import { inject, Injectable } from "@angular/core"
import { of } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { OperationsError } from "../../domain/errors/operations.error"
import { OperationsRepository } from "../../domain/repositories/operations.repository"
import { ServiceRequestsHttpSource } from "../source/service-requests-http.source"
import { ServiceOrdersHttpSource } from "../source/service-orders-http.source"

const unsupported = () =>
  of(Result.failure(new OperationsError("UNSUPPORTED", "Operación no disponible.")))

@Injectable({ providedIn: "root" })
export class OperationsRepositoryImpl implements OperationsRepository {
  private readonly source = inject(ServiceRequestsHttpSource)
  private readonly orders = inject(ServiceOrdersHttpSource)

  getRequests: OperationsRepository["getRequests"] = query => this.source.getRequests(query)
  getRequest: OperationsRepository["getRequest"] = id => this.source.getRequest(id)

  // Confirmed capabilities remain unwired until their separate implementation slices.
  createRequest: OperationsRepository["createRequest"] = params => this.source.createRequest(params)
  updateRequest: OperationsRepository["updateRequest"] = (id, params) =>
    this.source.updateRequest(id, params)
  cancelRequest: OperationsRepository["cancelRequest"] = (id, params) =>
    this.source.cancelRequest(id, params)
  getOrders: OperationsRepository["getOrders"] = query => this.orders.getOrders(query)
  getOrder: OperationsRepository["getOrder"] = id => this.orders.getOrder(id)
  createOrder: OperationsRepository["createOrder"] = params => this.orders.createOrder(params)
  updateOrder: OperationsRepository["updateOrder"] = unsupported
  changeOrderStatus: OperationsRepository["changeOrderStatus"] = unsupported
  scheduleOrder: OperationsRepository["scheduleOrder"] = (id, params) =>
    this.orders.scheduleOrder(id, params)
  replaceAssignments: OperationsRepository["replaceAssignments"] = (id, params) =>
    this.orders.replaceAssignments(id, params)
  getAgenda: OperationsRepository["getAgenda"] = unsupported
  getActiveReschedulingReasons: OperationsRepository["getActiveReschedulingReasons"] = () =>
    this.orders.getActiveReschedulingReasons()

  // Proposed contracts do not establish HTTP endpoints.
  getQuotes: OperationsRepository["getQuotes"] = unsupported
  getQuote: OperationsRepository["getQuote"] = unsupported
  createQuote: OperationsRepository["createQuote"] = unsupported
  updateQuote: OperationsRepository["updateQuote"] = unsupported
  getQuoteLines: OperationsRepository["getQuoteLines"] = unsupported
  createQuoteLine: OperationsRepository["createQuoteLine"] = unsupported
  updateQuoteLine: OperationsRepository["updateQuoteLine"] = unsupported
  getContracts: OperationsRepository["getContracts"] = unsupported
  getContract: OperationsRepository["getContract"] = unsupported
  createContract: OperationsRepository["createContract"] = unsupported
  updateContract: OperationsRepository["updateContract"] = unsupported
  getOrderStatuses: OperationsRepository["getOrderStatuses"] = unsupported
  createOrderStatus: OperationsRepository["createOrderStatus"] = unsupported
  updateOrderStatus: OperationsRepository["updateOrderStatus"] = unsupported
  getReschedulingReasons: OperationsRepository["getReschedulingReasons"] = unsupported
  createReschedulingReason: OperationsRepository["createReschedulingReason"] = unsupported
  updateReschedulingReason: OperationsRepository["updateReschedulingReason"] = unsupported
}
