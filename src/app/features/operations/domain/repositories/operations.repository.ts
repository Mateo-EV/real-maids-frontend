import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { Result } from "@/app/shared/utils/result"
import { OrderStatus } from "../entities/order-status.entity"
import { Quote } from "../entities/quote.entity"
import { QuoteLine } from "../entities/quote-line.entity"
import { ReschedulingReason } from "../entities/rescheduling-reason.entity"
import { ServiceContract } from "../entities/service-contract.entity"
import { OperationsError } from "../errors/operations.error"
import {
  AgendaEntry,
  ReschedulingReasonSummary,
  ServiceOrderDetail,
  ServiceOrderSummary,
  ServiceRequestSummary
} from "../models/operations-read.models"
import {
  AgendaQuery,
  CancelServiceRequestParams,
  ChangeOrderStatusParams,
  CreateOrderStatusParams,
  CreateQuoteLineParams,
  CreateQuoteParams,
  CreateReschedulingReasonParams,
  CreateServiceContractParams,
  CreateServiceOrderParams,
  CreateServiceRequestParams,
  QuoteQuery,
  ReplaceServiceAssignmentsParams,
  ScheduleServiceOrderParams,
  ServiceContractQuery,
  ServiceOrderQuery,
  ServiceRequestQuery,
  UpdateOrderStatusParams,
  UpdateQuoteLineParams,
  UpdateQuoteParams,
  UpdateReschedulingReasonParams,
  UpdateServiceContractParams,
  UpdateServiceOrderParams,
  UpdateServiceRequestParams
} from "../params/operations.params"

export interface OperationsRepository {
  // Confirmed capabilities; response projections are distinct from SQL snapshots.
  getRequests(
    query: ServiceRequestQuery
  ): Observable<Result<PaginationResponse<ServiceRequestSummary>, OperationsError>>
  getRequest(id: number): Observable<Result<ServiceRequestSummary, OperationsError>>
  createRequest(
    params: CreateServiceRequestParams
  ): Observable<Result<ServiceRequestSummary, OperationsError>>
  updateRequest(
    id: number,
    params: UpdateServiceRequestParams
  ): Observable<Result<ServiceRequestSummary, OperationsError>>
  cancelRequest(
    id: number,
    params: CancelServiceRequestParams
  ): Observable<Result<ServiceRequestSummary, OperationsError>>
  getOrders(
    query: ServiceOrderQuery
  ): Observable<Result<PaginationResponse<ServiceOrderSummary>, OperationsError>>
  getOrder(id: number): Observable<Result<ServiceOrderDetail, OperationsError>>
  createOrder(
    params: CreateServiceOrderParams
  ): Observable<Result<ServiceOrderDetail, OperationsError>>
  updateOrder(
    id: number,
    params: UpdateServiceOrderParams
  ): Observable<Result<ServiceOrderDetail, OperationsError>>
  changeOrderStatus(
    id: number,
    params: ChangeOrderStatusParams
  ): Observable<Result<ServiceOrderDetail, OperationsError>>
  scheduleOrder(
    id: number,
    params: ScheduleServiceOrderParams
  ): Observable<Result<ServiceOrderSummary, OperationsError>>
  replaceAssignments(
    id: number,
    params: ReplaceServiceAssignmentsParams
  ): Observable<Result<ServiceOrderSummary, OperationsError>>
  getAgenda(query: AgendaQuery): Observable<Result<AgendaEntry[], OperationsError>>
  getActiveReschedulingReasons(): Observable<Result<ReschedulingReasonSummary[], OperationsError>>

  // Proposed quote/contract/catalog capabilities; children stay under their parent.
  getQuotes(query: QuoteQuery): Observable<Result<PaginationResponse<Quote>, OperationsError>>
  getQuote(id: number): Observable<Result<Quote, OperationsError>>
  createQuote(params: CreateQuoteParams): Observable<Result<Quote, OperationsError>>
  updateQuote(id: number, params: UpdateQuoteParams): Observable<Result<Quote, OperationsError>>
  getQuoteLines(quoteId: number): Observable<Result<QuoteLine[], OperationsError>>
  createQuoteLine(
    quoteId: number,
    params: CreateQuoteLineParams
  ): Observable<Result<QuoteLine, OperationsError>>
  updateQuoteLine(
    quoteId: number,
    id: number,
    params: UpdateQuoteLineParams
  ): Observable<Result<QuoteLine, OperationsError>>
  getContracts(
    query: ServiceContractQuery
  ): Observable<Result<PaginationResponse<ServiceContract>, OperationsError>>
  getContract(id: number): Observable<Result<ServiceContract, OperationsError>>
  createContract(
    params: CreateServiceContractParams
  ): Observable<Result<ServiceContract, OperationsError>>
  updateContract(
    id: number,
    params: UpdateServiceContractParams
  ): Observable<Result<ServiceContract, OperationsError>>
  getOrderStatuses(): Observable<Result<OrderStatus[], OperationsError>>
  createOrderStatus(
    params: CreateOrderStatusParams
  ): Observable<Result<OrderStatus, OperationsError>>
  updateOrderStatus(
    id: number,
    params: UpdateOrderStatusParams
  ): Observable<Result<OrderStatus, OperationsError>>
  getReschedulingReasons(): Observable<Result<ReschedulingReason[], OperationsError>>
  createReschedulingReason(
    params: CreateReschedulingReasonParams
  ): Observable<Result<ReschedulingReason, OperationsError>>
  updateReschedulingReason(
    id: number,
    params: UpdateReschedulingReasonParams
  ): Observable<Result<ReschedulingReason, OperationsError>>
}

export const OPERATIONS_REPOSITORY = new InjectionToken<OperationsRepository>(
  "operations.repository"
)
