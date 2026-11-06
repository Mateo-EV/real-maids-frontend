import { inject, Injectable } from "@angular/core"
import { ReplaceServiceAssignmentsParams } from "../../domain/params/operations.params"
import { OPERATIONS_REPOSITORY } from "../../domain/repositories/operations.repository"

@Injectable({ providedIn: "root" })
export class ReplaceServiceAssignmentsUseCase {
  private readonly repository = inject(OPERATIONS_REPOSITORY)

  execute(id: number, params: ReplaceServiceAssignmentsParams) {
    return this.repository.replaceAssignments(id, params)
  }
}
