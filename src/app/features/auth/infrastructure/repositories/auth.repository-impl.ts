import { inject, Injectable } from "@angular/core"
import { LoginParams } from "../../domain/params/login.params"
import { AuthRepository } from "../../domain/repositories/auth.repository"
import { AuthHttpSource } from "../source/auth-http.source"
import { ChangePasswordParams } from "../../domain/params/change-password.params"

@Injectable({ providedIn: "root" })
export class AuthRepositoryImpl implements AuthRepository {
  private readonly source = inject(AuthHttpSource)

  login(params: LoginParams) {
    return this.source.login(params)
  }

  me(force = false) {
    // Keep the no-argument delegation for the ordinary snapshot read.
    return force ? this.source.me(true) : this.source.me()
  }

  changePassword(params: ChangePasswordParams) {
    return this.source.changePassword(params)
  }

  invalidate(): void {
    this.source.invalidate()
  }

  sessionChanges() {
    return this.source.sessionChanges()
  }

  logout(): void {
    this.source.logout()
  }
}
