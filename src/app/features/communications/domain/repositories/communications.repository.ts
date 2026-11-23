import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { CommunicationChannel } from "../entities/communication-channel.entity"
import { MessageTemplate } from "../entities/message-template.entity"
import { NotificationPreference } from "../entities/notification-preference.entity"
import { SentNotification } from "../entities/sent-notification.entity"
import { CrmNote } from "../entities/crm-note.entity"
import { CrmEmail } from "../entities/crm-email.entity"
import { EmailTemplate } from "../entities/email-template.entity"
import { CommunicationsError } from "../errors/communications.error"
import {
  CreateMessageTemplateParams,
  UpdateMessageTemplateParams,
  SetNotificationPreferenceParams,
  MessageTemplateQuery,
  SentNotificationQuery
} from "../params/communications.params"
import {
  CreateCrmNoteParams,
  CrmCommunicationQuery,
  CrmTarget,
  SendCrmEmailParams,
  UpdateCrmNoteParams
} from "../params/crm-communications.params"

// All operations are proposed; delivery history is read-only, never arbitrary CRUD.
export interface CommunicationsRepository {
  getChannels(): Observable<Result<CommunicationChannel[], CommunicationsError>>
  getTemplatesPage(
    query: MessageTemplateQuery
  ): Observable<Result<PaginationResponse<MessageTemplate>, CommunicationsError>>
  createTemplate(
    params: CreateMessageTemplateParams
  ): Observable<Result<MessageTemplate, CommunicationsError>>
  updateTemplate(
    id: number,
    params: UpdateMessageTemplateParams
  ): Observable<Result<MessageTemplate, CommunicationsError>>
  getPreferences(
    customerId: number
  ): Observable<Result<NotificationPreference[], CommunicationsError>>
  setPreference(
    customerId: number,
    channelId: number,
    params: SetNotificationPreferenceParams
  ): Observable<Result<NotificationPreference, CommunicationsError>>
  getNotificationsPage(
    query: SentNotificationQuery
  ): Observable<Result<PaginationResponse<SentNotification>, CommunicationsError>>
  getNotification(id: string): Observable<Result<SentNotification, CommunicationsError>>
}

export const COMMUNICATIONS_REPOSITORY = new InjectionToken<CommunicationsRepository>(
  "communications.repository"
)

/**
 * The confirmed CRM communications contract. Notes are append-only records whose author alone may
 * edit them (no delete endpoint exists); emails are recorded deliveries the client never resends by
 * itself. Authorization, the recipient address and the author are backend-owned.
 */
export interface CrmCommunicationsRepository {
  listNotes(
    target: CrmTarget,
    query: CrmCommunicationQuery
  ): Observable<Result<PaginationResponse<CrmNote>, CommunicationsError>>
  createNote(
    target: CrmTarget,
    params: CreateCrmNoteParams
  ): Observable<Result<CrmNote, CommunicationsError>>
  updateNote(
    target: CrmTarget,
    params: UpdateCrmNoteParams
  ): Observable<Result<CrmNote, CommunicationsError>>
  listEmails(
    target: CrmTarget,
    query: CrmCommunicationQuery
  ): Observable<Result<PaginationResponse<CrmEmail>, CommunicationsError>>
  sendEmail(
    target: CrmTarget,
    params: SendCrmEmailParams
  ): Observable<Result<CrmEmail, CommunicationsError>>
  listTemplates(): Observable<Result<readonly EmailTemplate[], CommunicationsError>>
}

export const CRM_COMMUNICATIONS_REPOSITORY = new InjectionToken<CrmCommunicationsRepository>(
  "communications.crm.repository"
)
