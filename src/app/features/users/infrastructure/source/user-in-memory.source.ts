import { Injectable } from "@angular/core"
import { Observable, of, switchMap, timer } from "rxjs"
import { Result } from "@/app/shared/utils/result"
import { Lang, User } from "../../domain/entities/user.entity"
import { UserError } from "../../domain/errors/user.error"
import { CreateUserParams } from "../../domain/params/create-user.params"
import { UpdateUserParams } from "../../domain/params/update-user.params"

type UserFields = Pick<User, "name" | "email" | "lang" | "isActive" | "roleId">

// Explicitly select public fields: this demo does not retain credentials or extra input properties.
const copyFields = (input: UserFields): UserFields => ({
  name: input.name,
  email: input.email,
  lang: input.lang,
  isActive: input.isActive,
  roleId: input.roleId
})

const cloneUser = (user: User): User =>
  User.create(
    user.id,
    user.name,
    user.email,
    user.lang,
    user.isActive,
    new Date(user.createdAt.getTime()),
    new Date(user.updatedAt.getTime()),
    user.roleId,
    user.lastAccess === null ? null : new Date(user.lastAccess.getTime())
  )

@Injectable({ providedIn: "root" })
export class UserInMemorySource {
  // FICTITIOUS DEMO DATA — source-owned profiles, not credentials or an API contract.
  // Construct once per root source instance, including server memory; no auth session is created.
  private users: User[] = Array.from({ length: 48 }, (_, index) => {
    const referenceNames = [
      "Carlos Mendoza",
      "Laura Sánchez",
      "María Rodríguez",
      "Johnathan Taylor",
      "David Gómez"
    ]
    const givenNames = ["Ana", "Luis", "Elena", "Miguel", "Sofía", "Andrés", "Lucía", "Daniel"]
    const familyNames = ["Vargas", "Torres", "Ramos", "Castillo", "Morales", "Herrera"]
    return User.create(
      index + 1,
      referenceNames[index] ??
        `${givenNames[(index - 5) % givenNames.length]} ${familyNames[Math.floor((index - 5) / givenNames.length)]}`,
      `persona.${index + 1}@example.test`,
      index === 3 || index % 7 === 6 ? Lang.EN : Lang.ES,
      index !== 4 && index < 43,
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-01T00:00:00Z"),
      index === 4 ? 3 : (index % 5) + 1,
      index === 4 || index % 8 === 7
        ? null
        : new Date(Date.UTC(2026, 8, 1, 19 - (index % 12), index % 60))
    )
  })
  private nextUserId = Math.max(...this.users.map(user => user.id)) + 1

  createUser(params: CreateUserParams): Observable<Result<User, UserError>> {
    const input = copyFields(params)
    const lastAccess = params.lastAccess == null ? null : new Date(params.lastAccess.getTime())

    return timer(250).pipe(
      switchMap(() => {
        const now = new Date()
        const user = User.create(
          this.nextUserId++,
          input.name,
          input.email,
          input.lang,
          input.isActive,
          now,
          new Date(now.getTime()),
          input.roleId,
          lastAccess === null ? null : new Date(lastAccess.getTime())
        )
        this.users = [...this.users, user]
        return of(Result.success(cloneUser(user)))
      })
    )
  }

  getUserById(id: number): Observable<Result<User, UserError>> {
    return timer(250).pipe(
      switchMap(() => {
        const user = this.users.find(item => item.id === id)
        return of(
          user ? Result.success(cloneUser(user)) : Result.failure(new UserError("USER_NOT_FOUND"))
        )
      })
    )
  }

  getUsers(): Observable<Result<User[], UserError>> {
    return timer(250).pipe(switchMap(() => of(Result.success(this.users.map(cloneUser)))))
  }

  deleteUserById(id: number): Observable<Result<void, UserError>> {
    return timer(250).pipe(
      switchMap(() => {
        if (!this.users.some(user => user.id === id)) {
          return of(Result.failure(new UserError("USER_NOT_FOUND")))
        }
        this.users = this.users.filter(user => user.id !== id)
        return of(Result.success<void>(undefined))
      })
    )
  }

  updateUserStatusById(id: number, isActive: boolean): Observable<Result<User, UserError>> {
    return timer(250).pipe(
      switchMap(() => {
        const existing = this.users.find(user => user.id === id)
        if (!existing) {
          return of(Result.failure(new UserError("USER_NOT_FOUND")))
        }
        const updated = cloneUser(existing)
        updated.isActive = isActive
        updated.updatedAt = new Date()
        this.users = this.users.map(user => (user.id === id ? updated : user))
        return of(Result.success(cloneUser(updated)))
      })
    )
  }

  updateUserById(id: number, params: UpdateUserParams): Observable<Result<User, UserError>> {
    const input = copyFields(params)

    return timer(250).pipe(
      switchMap(() => {
        const existing = this.users.find(user => user.id === id)
        if (!existing) {
          return of(Result.failure(new UserError("USER_NOT_FOUND")))
        }
        const updated = User.create(
          id,
          input.name,
          input.email,
          input.lang,
          input.isActive,
          new Date(existing.createdAt.getTime()),
          new Date(),
          input.roleId,
          existing.lastAccess === null ? null : new Date(existing.lastAccess.getTime())
        )
        this.users = this.users.map(user => (user.id === id ? updated : user))
        return of(Result.success(cloneUser(updated)))
      })
    )
  }
}
