import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { PaymentMethod } from "../entities/payment-method.entity"
import { PaymentStatus } from "../entities/payment-status.entity"
import { Invoice } from "../entities/invoice.entity"
import { InvoiceLine } from "../entities/invoice-line.entity"
import { Payment } from "../entities/payment.entity"
import { CollectionAttempt } from "../entities/collection-attempt.entity"
import { CollectionAdjustment } from "../entities/collection-adjustment.entity"
import { BillingError } from "../errors/billing.error"
import {
  InvoiceQuery,
  IssueInvoiceParams,
  UpdatePaymentMethodParams,
  RecordPaymentParams,
  RecordCollectionAdjustmentParams
} from "../params/billing.params"

// Schema-derived proposals only; no transport, processor or retry contract is implied.
export interface BillingRepository {
  getPaymentStatuses(): Observable<Result<PaymentStatus[], BillingError>>
  getPaymentMethods(customerId: number): Observable<Result<PaymentMethod[], BillingError>>
  updatePaymentMethod(
    id: number,
    params: UpdatePaymentMethodParams
  ): Observable<Result<PaymentMethod, BillingError>>
  getInvoicesPage(
    query: InvoiceQuery
  ): Observable<Result<PaginationResponse<Invoice>, BillingError>>
  getInvoice(id: number): Observable<Result<Invoice, BillingError>>
  getInvoiceLines(invoiceId: number): Observable<Result<InvoiceLine[], BillingError>>
  issueInvoice(params: IssueInvoiceParams): Observable<Result<Invoice, BillingError>>
  getPayments(
    invoiceId: number,
    query: PaginationParams
  ): Observable<Result<PaginationResponse<Payment>, BillingError>>
  recordPayment(
    invoiceId: number,
    params: RecordPaymentParams
  ): Observable<Result<Payment, BillingError>>
  getCollectionAttempts(
    invoiceId: number,
    query: PaginationParams
  ): Observable<Result<PaginationResponse<CollectionAttempt>, BillingError>>
  getCollectionAdjustments(
    invoiceId: number,
    query: PaginationParams
  ): Observable<Result<PaginationResponse<CollectionAdjustment>, BillingError>>
  recordCollectionAdjustment(
    invoiceId: number,
    params: RecordCollectionAdjustmentParams
  ): Observable<Result<CollectionAdjustment, BillingError>>
}

export const BILLING_REPOSITORY = new InjectionToken<BillingRepository>("billing.repository")
