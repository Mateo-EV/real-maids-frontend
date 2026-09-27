import { inject, Injectable } from "@angular/core"
import { AUTH_REPOSITORY, AuthRepository } from "../../domain/repositories/auth.repository"

@Injectable({ providedIn: "root" })
export class LogoutUseCase {
  private readonly authRepository = inject<AuthRepository>(AUTH_REPOSITORY)

  execute(): void {
    this.authRepository.logout()
  }
}
