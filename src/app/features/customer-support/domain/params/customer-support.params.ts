import { PaginationParams } from "@/app/shared/pagination/pagination.params"
import { SatisfactionRating } from "../entities/satisfaction-survey.entity"

export interface SupportRequestQuery extends PaginationParams {
  state?: string
  requestTypeId?: number
  customerId?: number
  // Calendar dates in the business timezone, not UTC-day filters.
  fromDate?: string
  toDate?: string
}

// Null customerId means the authenticated customer; staff must supply a customer.
export interface CreateSupportRequestParams {
  customerId: number | null
  orderId: number | null
  requestTypeId: number
  subject: string
  description: string
}

export interface AddSupportMessageParams {
  message: string
}

// Backend validates the currently documented target codes and transitions.
export interface ChangeSupportStateParams {
  state: string
  message: string | null
}

// Proposed survey action; the backend owns ID and creation timestamp.
export interface SubmitSatisfactionSurveyParams {
  orderId: number
  customerId: number
  rating: SatisfactionRating
  comment: string | null
}
