import { PaginationParams } from "@/app/shared/pagination/pagination.params"

export interface CreateMessageTemplateParams {
  channelId: number
  event: string
  language: string
  subject: string | null
  body: string
  isActive: boolean
}

export interface UpdateMessageTemplateParams {
  channelId?: number
  event?: string
  language?: string
  subject?: string | null
  body?: string
  isActive?: boolean
}

// Customer and channel identify the preference; the backend allocates its row ID.
export interface SetNotificationPreferenceParams {
  language: string
  isEnabled: boolean
}

export interface MessageTemplateQuery extends PaginationParams {
  channelId?: number
  event?: string
  language?: string
}

export interface SentNotificationQuery extends PaginationParams {
  templateId?: number
  userId?: number
  orderId?: number
  deliveryStatus?: string
}
