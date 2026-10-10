import { inject, Injectable } from "@angular/core"
import { LoginParams } from "../../domain/params/login.params"
import { AuthRepository } from "../../domain/repositories/auth.repository"
import { AuthHttpSource } from "../source/auth-http.source"

@Injectable({ providedIn: "root" })
export class AuthRepositoryImpl implements AuthRepository {
  private readonly source = inject(AuthHttpSource)

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
