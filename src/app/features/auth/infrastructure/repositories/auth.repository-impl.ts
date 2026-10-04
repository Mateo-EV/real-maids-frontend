import { inject, Injectable } from "@angular/core"
import { LoginParams } from "../../domain/params/login.params"
import { AuthRepository } from "../../domain/repositories/auth.repository"
import { AuthInMemorySource } from "../source/auth-in-memory.source"

@Injectable({ providedIn: "root" })
export class AuthRepositoryImpl implements AuthRepository {
  private readonly source = inject(AuthInMemorySource)

  login(params: LoginParams) {
    return this.source.login(params)
  }

  me() {
    return this.source.me()
  }

  logout(): void {
    this.source.logout()
  }
}
