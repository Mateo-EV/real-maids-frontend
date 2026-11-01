import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { QuickbooksError } from "../errors/quickbooks.error"
import {
  QuickbooksStatus,
  QuickbooksAuthorization,
  SynchronizationSummary,
  IntegrationEventSummary,
  QuickbooksInvoice
} from "../models/quickbooks.models"
import {
  SynchronizationQuery,
  IntegrationEventQuery,
  SynchronizeCustomerParams,
  QuickbooksOrderParams,
  RetrySynchronizationParams
} from "../params/quickbooks.params"

/** Confirmed backend operations. No OAuth callback, webhook or credential-writing frontend contract. */
export interface QuickbooksRepository {
  getStatus(): Observable<Result<QuickbooksStatus, QuickbooksError>>
  requestAuthorization(): Observable<Result<QuickbooksAuthorization, QuickbooksError>>
  disconnect(): Observable<Result<QuickbooksStatus, QuickbooksError>>
  synchronizeCustomer(
    params: SynchronizeCustomerParams
  ): Observable<Result<SynchronizationSummary, QuickbooksError>>
  invoiceOrder(
    params: QuickbooksOrderParams
  ): Observable<Result<QuickbooksInvoice, QuickbooksError>>
  getOrderInvoice(
    params: QuickbooksOrderParams
  ): Observable<Result<QuickbooksInvoice, QuickbooksError>>
  refreshOrderPayment(
    params: QuickbooksOrderParams
  ): Observable<Result<QuickbooksInvoice, QuickbooksError>>
  getSynchronizations(
    query: SynchronizationQuery
  ): Observable<Result<PaginationResponse<SynchronizationSummary>, QuickbooksError>>
  retrySynchronization(
    params: RetrySynchronizationParams
  ): Observable<Result<SynchronizationSummary, QuickbooksError>>
  getEvents(
    query: IntegrationEventQuery
  ): Observable<Result<PaginationResponse<IntegrationEventSummary>, QuickbooksError>>
}

export const QUICKBOOKS_REPOSITORY = new InjectionToken<QuickbooksRepository>(
  "quickbooks.repository"
)
