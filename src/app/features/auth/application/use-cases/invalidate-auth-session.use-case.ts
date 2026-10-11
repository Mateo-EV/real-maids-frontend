import { inject, Injectable } from "@angular/core"
import { AUTH_REPOSITORY } from "../../domain/repositories/auth.repository"

@Injectable({ providedIn: "root" })
export class InvalidateAuthSessionUseCase {
  private readonly repository = inject(AUTH_REPOSITORY)
  execute(): void {
    this.repository.invalidate()
  }
}
