import { PaginationParams } from "@/app/shared/pagination/pagination.params"

export interface CreateLandingSectionParams {
  key: string
  name: string
  order: number
  isVisible: boolean
}

export interface UpdateLandingSectionParams {
  key?: string
  name?: string
  order?: number
  isVisible?: boolean
}

/** Section association is supplied by the repository argument. */
export interface CreateLandingContentParams {
  language: string
  title: string | null
  body: string | null
  imageUrl: string | null
  isPublished: boolean
}

export interface UpdateLandingContentParams {
  language?: string
  title?: string | null
  body?: string | null
  imageUrl?: string | null
  isPublished?: boolean
}

/** Server captures origin IP, submission time and processing metadata. */
export interface SubmitWebFormParams {
  name: string
  email: string | null
  phone: string | null
  message: string | null
}

export interface ProcessWebFormParams {
  leadId: number | null
  isProcessed: boolean
}

export interface WebFormQuery extends PaginationParams {
  isProcessed?: boolean
  leadId?: number
}
