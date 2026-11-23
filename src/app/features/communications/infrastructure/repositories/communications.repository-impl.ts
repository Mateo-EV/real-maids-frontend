import { inject, Injectable } from "@angular/core"
import { CrmCommunicationsRepository } from "../../domain/repositories/communications.repository"
import {
  CreateCrmNoteParams,
  CrmCommunicationQuery,
  CrmTarget,
  SendCrmEmailParams,
  UpdateCrmNoteParams
} from "../../domain/params/crm-communications.params"
import { CommunicationsHttpSource } from "../source/communications-http.source"

@Injectable({ providedIn: "root" })
export class CommunicationsRepositoryImpl implements CrmCommunicationsRepository {
  private readonly source = inject(CommunicationsHttpSource)
  listNotes(target: CrmTarget, query: CrmCommunicationQuery) {
    return this.source.listNotes(target, query)
  }
  createNote(target: CrmTarget, params: CreateCrmNoteParams) {
    return this.source.createNote(target, params)
  }
  updateNote(target: CrmTarget, params: UpdateCrmNoteParams) {
    return this.source.updateNote(target, params)
  }
  listEmails(target: CrmTarget, query: CrmCommunicationQuery) {
    return this.source.listEmails(target, query)
  }
  sendEmail(target: CrmTarget, params: SendCrmEmailParams) {
    return this.source.sendEmail(target, params)
  }
  listTemplates() {
    return this.source.listTemplates()
  }
}
