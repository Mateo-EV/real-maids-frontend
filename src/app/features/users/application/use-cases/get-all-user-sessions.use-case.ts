import { inject, Injectable } from "@angular/core"
import { GetUserSessionsUseCase } from "./get-user-sessions.use-case"

@Injectable({ providedIn: "root" })
export class GetAllUserSessionsUseCase {
  private readonly query = inject(GetUserSessionsUseCase)

  execute() {
    return this.query.execute()
  }
}
