import { inject, Injectable } from "@angular/core"
import { USER_REPOSITORY } from "../../domain/repositories/user.repository"

@Injectable({ providedIn: "root" })
export class GetUserStatisticsUseCase {
  private readonly repository = inject(USER_REPOSITORY)

  execute() {
    return this.repository.getUserStatistics()
  }
}
