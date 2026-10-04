import { Injectable } from "@angular/core"
import { defer, Observable, of } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { User } from "../../domain/entities/user.entity"
import { UserError } from "../../domain/errors/user.error"
import { CreateUserParams } from "../../domain/params/create-user.params"
import { UpdateUserParams } from "../../domain/params/update-user.params"
import { UserRepository } from "../../domain/repositories/user.repository"

type UserFields = Pick<User, "name" | "age" | "email" | "lang" | "isActive">

// Explicitly select public fields: this demo does not retain credentials or extra input properties.
const copyFields = (input: UserFields): UserFields => ({
  name: input.name,
  age: input.age,
  email: input.email,
  lang: input.lang,
  isActive: input.isActive
})

const cloneUser = (user: User): User => User.create(
  user.id, user.name, user.age, user.email, user.lang, user.isActive,
  new Date(user.createdAt.getTime()), new Date(user.updatedAt.getTime())
)

@Injectable({ providedIn: "root" })
export class UserInMemorySource implements UserRepository {
  private users: User[] = []
  private nextUserId = 1

  createUser(params: CreateUserParams): Observable<Result<User, UserError>> {
    const input = copyFields(params)

    return defer(() => {
      const now = new Date()
      const user = User.create(
        this.nextUserId++, input.name, input.age, input.email, input.lang, input.isActive,
        now, new Date(now.getTime())
      )
      this.users = [...this.users, user]
      return of(Result.success(cloneUser(user)))
    })
  }

  getUserById(id: number): Observable<Result<User, UserError>> {
    return defer(() => {
      const user = this.users.find(item => item.id === id)
      return of(user
        ? Result.success(cloneUser(user))
        : Result.failure(new UserError("USER_NOT_FOUND")))
    })
  }

  getUsers(): Observable<Result<User[], UserError>> {
    return defer(() => of(Result.success(this.users.map(cloneUser))))
  }

  deleteUserById(id: number): Observable<Result<void, UserError>> {
    return defer(() => {
      if (!this.users.some(user => user.id === id)) {
        return of(Result.failure(new UserError("USER_NOT_FOUND")))
      }
      this.users = this.users.filter(user => user.id !== id)
      return of(Result.success<void>(undefined))
    })
  }

  updateUserById(id: number, params: UpdateUserParams): Observable<Result<User, UserError>> {
    const input = copyFields(params)

    return defer(() => {
      const existing = this.users.find(user => user.id === id)
      if (!existing) {
        return of(Result.failure(new UserError("USER_NOT_FOUND")))
      }
      const updated = User.create(
        id, input.name, input.age, input.email, input.lang, input.isActive,
        new Date(existing.createdAt.getTime()), new Date()
      )
      this.users = this.users.map(user => user.id === id ? updated : user)
      return of(Result.success(cloneUser(updated)))
    })
  }
}
