import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { SupportStatus } from "../entities/support-status.entity"
import { SatisfactionSurvey } from "../entities/satisfaction-survey.entity"
import { CustomerSupportError } from "../errors/customer-support.error"
import { SupportRequestView, SupportDetail, SupportRequestTypeView } from "../models/support-views"
import {
  SupportRequestQuery,
  CreateSupportRequestParams,
  AddSupportMessageParams,
  ChangeSupportStateParams,
  SubmitSatisfactionSurveyParams
} from "../params/customer-support.params"

export interface CustomerSupportRepository {
  // Confirmed controller operations, using public/redacted DTO projections.
  getRequestTypes(): Observable<Result<SupportRequestTypeView[], CustomerSupportError>>
  getRequestsPage(
    query: SupportRequestQuery
  ): Observable<Result<PaginationResponse<SupportRequestView>, CustomerSupportError>>
  getRequest(id: number): Observable<Result<SupportDetail, CustomerSupportError>>
  createRequest(
    params: CreateSupportRequestParams
  ): Observable<Result<SupportDetail, CustomerSupportError>>
  addMessage(
    requestId: number,
    params: AddSupportMessageParams
  ): Observable<Result<SupportDetail, CustomerSupportError>>
  changeState(
    requestId: number,
    params: ChangeSupportStateParams
  ): Observable<Result<SupportDetail, CustomerSupportError>>
  // Proposed schema coverage; no corresponding API is claimed.
  getStatuses(): Observable<Result<SupportStatus[], CustomerSupportError>>
  getSurveyByOrder(
    orderId: number
  ): Observable<Result<SatisfactionSurvey | null, CustomerSupportError>>
  submitSurvey(
    params: SubmitSatisfactionSurveyParams
  ): Observable<Result<SatisfactionSurvey, CustomerSupportError>>
}

export const CUSTOMER_SUPPORT_REPOSITORY = new InjectionToken<CustomerSupportRepository>(
  "customer-support.repository"
)
