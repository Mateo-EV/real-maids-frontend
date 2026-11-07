import { inject, Injectable } from "@angular/core"
import { AgendaQuery } from "../../domain/params/operations.params"
import { OPERATIONS_REPOSITORY } from "../../domain/repositories/operations.repository"

@Injectable({ providedIn: "root" })
export class GetAgendaUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)

  execute(query: AgendaQuery) {
    return this.repository.getAgenda(query)
  }
}
