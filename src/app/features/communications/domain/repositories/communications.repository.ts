import { InjectionToken } from "@angular/core"
import { Observable } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { PaginationResponse } from "@/app/shared/pagination/pagination.response"
import { CrmNote } from "../entities/crm-note.entity"
import { CrmEmail } from "../entities/crm-email.entity"
import { EmailTemplate } from "../entities/email-template.entity"
import { CommunicationsError } from "../errors/communications.error"
import {
  CreateCrmNoteParams,
  CrmCommunicationQuery,
  CrmTarget,
  SendCrmEmailParams,
  UpdateCrmNoteParams
} from "../params/crm-communications.params"

/**
 * The confirmed CRM communications contract. Notes are append-only records whose author alone may
 * edit them (no delete endpoint exists); emails are recorded deliveries the client never resends by
 * itself. Authorization, the recipient address and the author are backend-owned.
 */
export interface CommunicationsRepository {
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

export const COMMUNICATIONS_REPOSITORY = new InjectionToken<CommunicationsRepository>(
  "communications.repository"
)
