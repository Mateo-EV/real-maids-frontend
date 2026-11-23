import { inject, Injectable } from "@angular/core"
import { COMMUNICATIONS_REPOSITORY } from "../../domain/repositories/communications.repository"
import {
  CreateCrmNoteParams,
  CrmCommunicationQuery,
  CrmTarget,
  SendCrmEmailParams,
  UpdateCrmNoteParams
} from "../../domain/params/crm-communications.params"

/** Stateless, named actions: transport validation and coordination stay outside the use case. */
@Injectable({ providedIn: "root" })
export class ListCrmNotesUseCase {
  private readonly repository = inject(COMMUNICATIONS_REPOSITORY)
  execute(target: CrmTarget, query: CrmCommunicationQuery = {}) {
    return this.repository.listNotes(target, query)
  }
}
@Injectable({ providedIn: "root" })
export class CreateCrmNoteUseCase {
  private readonly repository = inject(COMMUNICATIONS_REPOSITORY)
  execute(target: CrmTarget, params: CreateCrmNoteParams) {
    return this.repository.createNote(target, params)
  }
}
@Injectable({ providedIn: "root" })
export class UpdateCrmNoteUseCase {
  private readonly repository = inject(COMMUNICATIONS_REPOSITORY)
  execute(target: CrmTarget, params: UpdateCrmNoteParams) {
    return this.repository.updateNote(target, params)
  }
}
@Injectable({ providedIn: "root" })
export class ListCrmEmailsUseCase {
  private readonly repository = inject(COMMUNICATIONS_REPOSITORY)
  execute(target: CrmTarget, query: CrmCommunicationQuery = {}) {
    return this.repository.listEmails(target, query)
  }
}
@Injectable({ providedIn: "root" })
export class SendCrmEmailUseCase {
  private readonly repository = inject(COMMUNICATIONS_REPOSITORY)
  execute(target: CrmTarget, params: SendCrmEmailParams) {
    return this.repository.sendEmail(target, params)
  }
}
@Injectable({ providedIn: "root" })
export class ListEmailTemplatesUseCase {
  private readonly repository = inject(COMMUNICATIONS_REPOSITORY)
  execute() {
    return this.repository.listTemplates()
  }
}
