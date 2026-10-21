import { inject, Injectable } from "@angular/core"
import { CreateUserParams } from "../../domain/params/create-user.params"
import { UpdateUserParams } from "../../domain/params/update-user.params"
import { UserRepository } from "../../domain/repositories/user.repository"
import { UserHttpSource } from "../source/user-http.source"
import { UserListQuery } from "../../domain/models/user-list-query"

@Injectable({ providedIn: "root" })
export class UserRepositoryImpl implements UserRepository {
  private readonly source = inject(UserHttpSource)

  createUser(params: CreateUserParams) {
    return this.source.createUser(params)
  }

  getUserById(id: number) {
    return this.source.getUserById(id)
  }

  getUsersPage(query: UserListQuery) {
    return this.source.getUsersPage(query)
  }

  getUsers() {
    return this.source.getUsers()
  }

  deleteUserById(id: number) {
    return this.source.deleteUserById(id)
  }

  updateUserStatusById(id: number, isActive: boolean) {
    return this.source.updateUserStatusById(id, isActive)
  }

  updateUserById(id: number, params: UpdateUserParams) {
    return this.source.updateUserById(id, params)
  }
}
